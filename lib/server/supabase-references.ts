import { supabaseRequest } from "./supabase";
import { ARTWORK_BUCKET } from "./assets";
import {
  sameOrigin,
  readJSON,
  json,
  failure,
  HttpError,
  uuid,
  textField,
  safeURL,
} from "./http";

/** Authenticated and anonymous Supabase users both own private inspiration boards. */
export async function accountReferences(
  request: Request,
): Promise<Response | null> {
  const auth = supabaseRequest(request);
  if (!auth) return null;
  try {
    const { data, error } = await auth.client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError")
      throw new HttpError(401, "Sign in again to open your inspiration board.");
    if (!data.user) return null;
    const owner = data.user.id,
      url = new URL(request.url);
    if (request.method === "GET") {
      const image = url.searchParams.get("image");
      if (image) {
        const row = await auth.client
          .from("threadform_references")
          .select("image_path")
          .eq("id", uuid(image))
          .eq("owner", owner)
          .maybeSingle();
        if (row.error)
          throw new HttpError(503, "Reference storage could not be reached.");
        if (!row.data?.image_path)
          throw new HttpError(404, "Reference image unavailable.");
        const blob = await auth.client.storage
          .from(ARTWORK_BUCKET)
          .download(row.data.image_path);
        if (blob.error || !blob.data)
          throw new HttpError(404, "Reference image unavailable.");
        return auth.finish(
          new Response(blob.data, {
            headers: {
              "Content-Type": blob.data.type,
              "Content-Disposition": "inline",
            },
          }),
        );
      }
      const offset = Math.max(
        0,
        Math.floor(Number(url.searchParams.get("offset")) || 0),
      );
      const rows = await auth.client
        .from("threadform_references")
        .select("id,title,url,notes,tags,palette,image_path,created_at")
        .eq("owner", owner)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 49);
      if (rows.error)
        throw new HttpError(503, "Your inspiration board could not be loaded.");
      return auth.finish(
        json({
          references: rows.data.map((row) => ({
            id: row.id,
            title: row.title,
            url: row.url,
            notes: row.notes,
            tags: row.tags,
            palette: row.palette,
            image: row.image_path ? `/api/references?image=${row.id}` : null,
            createdAt: row.created_at,
          })),
          nextOffset: rows.data.length === 50 ? offset + 50 : null,
        }),
      );
    }
    sameOrigin(request);
    if (request.method === "DELETE") {
      const row = await auth.client
        .from("threadform_references")
        .delete()
        .eq("id", uuid(url.searchParams.get("id")))
        .eq("owner", owner)
        .select("image_path")
        .maybeSingle();
      if (row.error)
        throw new HttpError(503, "The reference could not be removed.");
      if (row.data?.image_path)
        await auth.client.storage
          .from(ARTWORK_BUCKET)
          .remove([row.data.image_path]);
      return auth.finish(json({ deleted: true }));
    }
    const d = await readJSON(request, 2 * 1024 * 1024),
      id = uuid(d.id),
      title = textField(d.title, 150),
      link = safeURL(d.url),
      notes = textField(d.notes, 3000);
    if (!title) throw new HttpError(400, "Add a title for this reference.");
    if (
      !Array.isArray(d.tags) ||
      d.tags.length > 12 ||
      d.tags.some((t) => typeof t !== "string" || t.length > 40)
    )
      throw new HttpError(400, "Use up to twelve short tags.");
    if (
      !Array.isArray(d.palette) ||
      d.palette.length > 16 ||
      d.palette.some((c) => typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))
    )
      throw new HttpError(400, "Invalid reference palette.");
    const existing = await auth.client
      .from("threadform_references")
      .select("id")
      .eq("id", id)
      .eq("owner", owner)
      .maybeSingle();
    if (existing.error)
      throw new HttpError(
        503,
        "Reference storage needs its database migration.",
      );
    if (existing.data) return auth.finish(json({ id }));
    let imagePath: string | null = null;
    if (d.image) {
      const match = textField(d.image, 1500000).match(
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match)
        throw new HttpError(400, "Use a PNG, JPG or WebP reference image.");
      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      if (bytes.length > 1048576)
        throw new HttpError(413, "Reference previews must be under 1 MB.");
      const valid =
        match[1] === "png"
          ? bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71
          : match[1] === "jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
              new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
      if (!valid)
        throw new HttpError(
          400,
          "The image content does not match its format.",
        );
      imagePath = owner + "/reference-" + id;
      const uploaded = await auth.client.storage
        .from(ARTWORK_BUCKET)
        .upload(imagePath, bytes, { contentType: `image/${match[1]}` });
      if (
        uploaded.error &&
        uploaded.error.message !== "The resource already exists"
      ) {
        // A previous interrupted save may already have uploaded this exact preview.
        const existingImage = await auth.client.storage
          .from(ARTWORK_BUCKET)
          .info(imagePath);
        if (existingImage.error)
          throw new HttpError(503, "Reference image could not be uploaded.");
      }
    }
    const inserted = await auth.client
      .from("threadform_references")
      .insert({
        id,
        owner,
        title,
        url: link,
        notes,
        tags: d.tags,
        palette: d.palette,
        image_path: imagePath,
        created_at: Date.now(),
      });
    if (inserted.error)
      throw new HttpError(
        503,
        "The reference could not be saved. Retry with the same open reference.",
      );
    return auth.finish(json({ id }, 201));
  } catch (error) {
    return auth.finish(failure(error));
  }
}
