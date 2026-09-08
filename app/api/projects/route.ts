import { validateProject } from "@/lib/embroidery/project";
import { accountProjects } from "@/lib/server/supabase-projects";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  limitWrites,
  database,
  storage,
  identity,
  sameOrigin,
  readJSON,
  json,
  failure,
  HttpError,
  uuid,
  pageOffset,
} from "@/lib/server/http";
type ProjectRow = {
  id: string;
  name: string;
  revision: number;
  blob_key: string;
  object_count: number;
  updated_at: number;
};
export async function GET(request: Request) {
  try {
    const account = await accountProjects(request);
    if (account) return account;
    const owner = await identity(request),
      db = database(),
      url = new URL(request.url),
      id = url.searchParams.get("id");
    if (!id) {
      const offset = pageOffset(url);
      const rows = await db
        .prepare(
          "SELECT id,name,revision,object_count,updated_at FROM studio_projects WHERE owner=? AND revision>0 ORDER BY updated_at DESC,id LIMIT 50 OFFSET ?",
        )
        .bind(owner, offset)
        .all<ProjectRow>();
      return json({
        projects: rows.results,
        nextOffset: rows.results.length === 50 ? offset + 50 : null,
      });
    }
    const row = await db
      .prepare(
        "SELECT id,name,revision,blob_key,object_count,updated_at FROM studio_projects WHERE id=? AND owner=?",
      )
      .bind(uuid(id), owner)
      .first<ProjectRow>();
    if (!row) throw new HttpError(404, "This saved project is unavailable.");
    if (url.searchParams.has("history")) {
      const history = await db
        .prepare(
          "SELECT revision,created_at FROM studio_revisions WHERE project_id=? ORDER BY revision DESC LIMIT 50",
        )
        .bind(id)
        .all();
      return json({ history: history.results });
    }
    const version = url.searchParams.get("revision");
    let key = row.blob_key;
    if (version) {
      const revision = Number(version);
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new HttpError(400, "Invalid revision.");
      const snapshot = await db
        .prepare(
          "SELECT blob_key FROM studio_revisions WHERE project_id=? AND revision=?",
        )
        .bind(id, revision)
        .first<{ blob_key: string }>();
      if (!snapshot) throw new HttpError(404, "This revision is unavailable.");
      key = snapshot.blob_key;
    }
    const blob = await storage().get(key);
    if (!blob)
      throw new HttpError(
        503,
        "The saved file is temporarily unavailable. Please retry.",
      );
    return json({
      id: row.id,
      revision: row.revision,
      project: JSON.parse(await blob.text()),
      restoredRevision: version ? Number(version) : null,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const account = await accountProjects(request);
    if (account) return account;
    sameOrigin(request);
    const owner = await identity(request),
      data = await readJSON(request),
      id = uuid(data.id),
      saveId = uuid(data.saveId),
      expected = data.expectedRevision;
    if (
      request.headers.has("X-Threadform-Namespace") &&
      request.headers.get("X-Threadform-Namespace") !== owner
    )
      throw new HttpError(
        409,
        "Your studio account changed. Reopen the current workspace before saving.",
      );
    if (
      typeof expected !== "number" ||
      !Number.isSafeInteger(expected) ||
      expected < 0
    )
      throw new HttpError(400, "Invalid project revision.");
    await limitWrites(owner);
    let project;
    try {
      project = validateProject(data.project);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Invalid project.",
      );
    }
    const db = database(),
      bucket = storage(),
      existing = await db
        .prepare(
          "SELECT owner,revision,blob_key FROM studio_projects WHERE id=?",
        )
        .bind(id)
        .first<{ owner: string; revision: number; blob_key: string }>();
    if (existing && existing.owner !== owner)
      throw new HttpError(404, "This saved project is unavailable.");
    if (expected >= Number.MAX_SAFE_INTEGER)
      throw new HttpError(400, "Project revision exceeds numeric precision.");
    const legacyKey = `projects/${encodeURIComponent(owner)}/${id}/${saveId}.json`;
    const serialized = JSON.stringify(project);
    const hash = bytesToHex(sha256(new TextEncoder().encode(serialized)));
    // A concurrent request must never overwrite a winner's bytes. The save ID
    // is claimed atomically in D1; the immutable content path lives in R2.
    const key = `projects/${encodeURIComponent(owner)}/${id}/${saveId}-${hash}.json`;
    const findRetry = () =>
      db
        .prepare(
          "SELECT revision,blob_key FROM studio_revisions WHERE project_id=? AND (save_id=? OR blob_key=?) AND EXISTS (SELECT 1 FROM studio_projects WHERE id=? AND owner=?)",
        )
        .bind(id, saveId, legacyKey, id, owner)
        .first<{ revision: number; blob_key: string }>();
    const acknowledge = async (retry: {
      revision: number;
      blob_key: string;
    }) => {
      const prior = await bucket.get(retry.blob_key);
      if (!prior)
        throw new HttpError(
          503,
          "The saved snapshot could not be verified. Retry this save.",
        );
      if (JSON.stringify(JSON.parse(await prior.text())) !== serialized)
        throw new HttpError(
          409,
          "This save identifier was already used for a different snapshot. Save a new copy.",
        );
      return json({ id, revision: retry.revision });
    };
    const retry = existing ? await findRetry() : null;
    if (retry) return await acknowledge(retry);
    if ((existing?.revision ?? 0) !== expected)
      throw new HttpError(
        409,
        "A newer version was saved elsewhere. Save this design as a copy or open the latest version before continuing.",
      );
    await bucket.put(key, serialized, {
      httpMetadata: { contentType: "application/json" },
    });
    const now = Date.now(),
      statements: D1PreparedStatement[] = [];
    if (!existing)
      statements.push(
        db
          .prepare(
            "INSERT INTO studio_projects(id,owner,name,revision,blob_key,object_count,updated_at) VALUES(?,?,?,0,'',?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(id, owner, project.name, project.objects.length, now),
      );
    const updateIndex = statements.length;
    statements.push(
      db
        .prepare(
          "UPDATE studio_projects SET name=?,revision=revision+1,blob_key=?,object_count=?,updated_at=? WHERE id=? AND owner=? AND revision=? AND NOT EXISTS (SELECT 1 FROM studio_revisions WHERE project_id=? AND save_id=?) RETURNING revision",
        )
        .bind(
          project.name,
          key,
          project.objects.length,
          now,
          id,
          owner,
          expected,
          id,
          saveId,
        ),
    );
    statements.push(
      db
        .prepare(
          "INSERT INTO studio_revisions(project_id,revision,blob_key,created_at,save_id) SELECT id,revision,blob_key,?,? FROM studio_projects WHERE id=? AND owner=? AND blob_key=? ON CONFLICT DO NOTHING",
        )
        .bind(now, saveId, id, owner, key),
    );
    const results = await db.batch<{ revision: number }>(statements);
    if (!results[updateIndex].results.length) {
      const raced = await findRetry();
      // Identical retries share the content path. Preserve the committed blob.
      if (raced?.blob_key !== key) await bucket.delete(key);
      if (raced) return await acknowledge(raced);
      throw new HttpError(
        409,
        "Another save completed first. Your open design is preserved; save it as a copy.",
      );
    }
    return json({ id, revision: results[updateIndex].results[0].revision });
  } catch (error) {
    return failure(error);
  }
}
