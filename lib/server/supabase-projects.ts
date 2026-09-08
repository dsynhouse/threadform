import { supabaseRequest } from "./supabase";
import { verifiedUser } from "./verified-user";
import {
  json,
  readJSON,
  sameOrigin,
  uuid,
  HttpError,
  failure,
  pageOffset,
} from "./http";
import { validateProject } from "@/lib/embroidery/project";
import { projectSnapshot } from "./assets";
import { projectDelivery } from "./project-delivery";
export async function accountProjects(
  request: Request,
): Promise<Response | null> {
  const auth = supabaseRequest(request);
  if (!auth) return null;
  try {
    const user = await verifiedUser(auth.client);
    if (!user) return null;
    const owner = user.id,
      url = new URL(request.url),
      id = url.searchParams.get("id");
    if (request.method === "POST") {
      sameOrigin(request);
      if (
        request.headers.has("X-Threadform-Namespace") &&
        request.headers.get("X-Threadform-Namespace") !== "account:" + owner
      )
        throw new HttpError(
          409,
          "The signed-in account changed. Reopen this account's workspace before saving.",
        );
      const d = await readJSON(request),
        expected = d.expectedRevision;
      if (
        typeof expected !== "number" ||
        !Number.isSafeInteger(expected) ||
        expected < 0 ||
        expected >= 2147483647
      )
        throw new HttpError(400, "Invalid project revision.");
      let project;
      try {
        project = validateProject(
          d.snapshotId
            ? await projectSnapshot(auth.client, owner, uuid(d.snapshotId))
            : d.project,
        );
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(
          400,
          e instanceof Error ? e.message : "Invalid design.",
        );
      }
      const { data: saved, error: saveError } = await auth.client.rpc(
        "save_threadform_project",
        {
          p_id: uuid(d.id),
          p_save_id: uuid(d.saveId),
          p_expected: expected,
          p_project: project,
        },
      );
      if (saveError) {
        if (saveError.code === "40001")
          throw new HttpError(
            409,
            "A newer revision exists. Save a copy or open the latest design.",
          );
        if (saveError.code === "42501")
          throw new HttpError(404, "This project is unavailable.");
        if (saveError.code === "23505")
          throw new HttpError(
            409,
            "This save identifier was used for another snapshot. Save a copy.",
          );
        if (
          saveError.code === "P0001" &&
          saveError.message === "Save rate exceeded"
        )
          throw new HttpError(
            429,
            "Too many saves in a short time. Wait a minute, then retry the same save.",
          );
        if (["22023", "23514", "P0001"].includes(saveError.code))
          throw new HttpError(
            400,
            "The saved project payload is invalid or exceeds snapshot storage. Download a local copy.",
          );
        throw new HttpError(
          503,
          "Account storage is unavailable. Keep your design open or download a copy.",
        );
      }
      return auth.finish(json(saved));
    }
    if (!id) {
      const offset = pageOffset(url);
      const { data: projects, error } = await auth.client
        .from("threadform_projects")
        .select("id,name,revision,object_count,updated_at")
        .eq("owner", owner)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(offset, offset + 49);
      if (error)
        throw new HttpError(503, "Account projects could not be loaded.");
      return auth.finish(
        json({
          projects,
          nextOffset: projects.length === 50 ? offset + 50 : null,
        }),
      );
    }
    const { data: row, error: rowError } = await auth.client
      .from("threadform_projects")
      .select("id,revision,project")
      .eq("id", uuid(id))
      .eq("owner", owner)
      .maybeSingle();
    if (rowError)
      throw new HttpError(503, "Account project could not be loaded.");
    if (!row) throw new HttpError(404, "This saved project is unavailable.");
    if (url.searchParams.has("history")) {
      const { data: history, error } = await auth.client
        .from("threadform_revisions")
        .select("revision,created_at")
        .eq("project_id", id)
        .eq("owner", owner)
        .order("revision", { ascending: false })
        .limit(50);
      if (error)
        throw new HttpError(503, "Project history could not be loaded.");
      return auth.finish(json({ history }));
    }
    const version = url.searchParams.get("revision");
    if (version) {
      const revision = Number(version);
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new HttpError(400, "Invalid revision.");
      const { data: snapshot, error } = await auth.client
        .from("threadform_revisions")
        .select("project")
        .eq("project_id", id)
        .eq("revision", revision)
        .eq("owner", owner)
        .maybeSingle();
      if (error)
        throw new HttpError(503, "Project revision could not be loaded.");
      if (!snapshot) throw new HttpError(404, "This revision is unavailable.");
      row.project = snapshot.project;
    }
    return auth.finish(
      json({
        id: row.id,
        revision: row.revision,
        ...(await projectDelivery(auth.client, owner, row.project)),
        restoredRevision: version ? Number(version) : null,
      }),
    );
  } catch (error) {
    return auth.finish(failure(error));
  }
}
