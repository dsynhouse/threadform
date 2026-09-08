import { supabaseRequest } from "./supabase";
import { json, readJSON, sameOrigin, uuid, HttpError, failure } from "./http";
import { validateProject } from "@/lib/embroidery/project";
import { projectSnapshot } from "./assets";
import { projectDelivery } from "./project-delivery";
export async function accountProjects(
  request: Request,
): Promise<Response | null> {
  const auth = supabaseRequest(request);
  if (!auth) return null;
  try {
    const { data, error } = await auth.client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError")
      throw new HttpError(
        401,
        "Your account session has expired. Sign in again before saving.",
      );
    if (!data.user) return null;
    const owner = data.user.id,
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
        expected < 0
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
        if (saveError.code === "P0001")
          throw new HttpError(
            409,
            "Too many saves in a short time. Wait a minute, then retry the same save.",
          );
        throw new HttpError(
          503,
          "Account storage is unavailable. Keep your design open or download a copy.",
        );
      }
      return auth.finish(json(saved));
    }
    if (!id) {
      const offset = Math.max(
        0,
        Math.min(
          10000,
          Math.floor(Number(url.searchParams.get("offset")) || 0),
        ),
      );
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
