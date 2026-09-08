import { validateProject } from "@/lib/embroidery/project";
import { accountProjects } from "@/lib/server/supabase-projects";
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
      const offset = Math.max(
        0,
        Math.min(10000, Number(url.searchParams.get("offset")) || 0),
      );
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
    const key = `projects/${encodeURIComponent(owner)}/${id}/${saveId}.json`;
    const retry = existing
      ? await db
          .prepare(
            "SELECT revision FROM studio_revisions WHERE project_id=? AND blob_key=?",
          )
          .bind(id, key)
          .first<{ revision: number }>()
      : null;
    if (retry) {
      const prior = await bucket.get(key);
      if (!prior)
        throw new HttpError(
          503,
          "The saved snapshot could not be verified. Retry this save.",
        );
      if (
        JSON.stringify(JSON.parse(await prior.text())) !==
        JSON.stringify(project)
      )
        throw new HttpError(
          409,
          "This save identifier was already used for a different snapshot. Save a new copy.",
        );
      return json({ id, revision: retry.revision });
    }
    if ((existing?.revision ?? 0) !== expected)
      throw new HttpError(
        409,
        "A newer version was saved elsewhere. Save this design as a copy or open the latest version before continuing.",
      );
    await bucket.put(key, JSON.stringify(project), {
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
          "UPDATE studio_projects SET name=?,revision=revision+1,blob_key=?,object_count=?,updated_at=? WHERE id=? AND owner=? AND revision=? RETURNING revision",
        )
        .bind(
          project.name,
          key,
          project.objects.length,
          now,
          id,
          owner,
          expected,
        ),
    );
    statements.push(
      db
        .prepare(
          "INSERT INTO studio_revisions(project_id,revision,blob_key,created_at) SELECT id,revision,blob_key,? FROM studio_projects WHERE id=? AND owner=? AND blob_key=? ON CONFLICT(project_id,revision) DO NOTHING",
        )
        .bind(now, id, owner, key),
    );
    const results = await db.batch<{ revision: number }>(statements);
    if (!results[updateIndex].results.length) {
      await bucket.delete(key);
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
