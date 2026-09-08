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
  textField,
  safeURL,
  pageOffset,
} from "@/lib/server/http";
import { accountReferences } from "@/lib/server/supabase-references";
type ReferenceRow = {
  id: string;
  title: string;
  url: string;
  notes: string;
  tags: string;
  palette: string;
  image_key: string | null;
  created_at: number;
};
export async function GET(request: Request) {
  try {
    const account = await accountReferences(request);
    if (account) return account;
    const owner = await identity(request),
      db = database(),
      url = new URL(request.url),
      image = url.searchParams.get("image");
    if (image) {
      const row = await db
        .prepare(
          "SELECT image_key FROM studio_references WHERE id=? AND owner=?",
        )
        .bind(uuid(image), owner)
        .first<{ image_key: string | null }>();
      if (!row?.image_key)
        throw new HttpError(404, "Reference image unavailable.");
      const blob = await storage().get(row.image_key);
      if (!blob) throw new HttpError(404, "Reference image unavailable.");
      return new Response(blob.body, {
        headers: {
          "Content-Type": blob.httpMetadata?.contentType ?? "image/png",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const offset = pageOffset(url);
    const result = await db
      .prepare(
        "SELECT id,title,url,notes,tags,palette,image_key,created_at FROM studio_references WHERE owner=? ORDER BY created_at DESC,id LIMIT 50 OFFSET ?",
      )
      .bind(owner, offset)
      .all<ReferenceRow>();
    return json({
      references: result.results.map((row) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        notes: row.notes,
        tags: JSON.parse(row.tags),
        palette: JSON.parse(row.palette),
        image: row.image_key ? `/api/references?image=${row.id}` : null,
        createdAt: row.created_at,
      })),
      nextOffset: result.results.length === 50 ? offset + 50 : null,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const account = await accountReferences(request);
    if (account) return account;
    sameOrigin(request);
    const owner = await identity(request),
      data = await readJSON(request, 2 * 1024 * 1024),
      id = uuid(data.id),
      title = textField(data.title, 150),
      url = safeURL(data.url),
      notes = textField(data.notes, 3000);
    await limitWrites(owner);
    if (!title) throw new HttpError(400, "Add a title for this reference.");
    if (
      !Array.isArray(data.tags) ||
      data.tags.length > 12 ||
      data.tags.some((x) => typeof x !== "string" || x.length > 40)
    )
      throw new HttpError(400, "Use up to twelve short tags.");
    if (
      !Array.isArray(data.palette) ||
      data.palette.length > 16 ||
      data.palette.some(
        (x) => typeof x !== "string" || !/^#[0-9a-f]{6}$/i.test(x),
      )
    )
      throw new HttpError(400, "Invalid reference palette.");
    const existing = await database()
      .prepare("SELECT owner FROM studio_references WHERE id=?")
      .bind(id)
      .first<{ owner: string }>();
    if (existing) {
      if (existing.owner !== owner)
        throw new HttpError(404, "This reference is unavailable.");
      return json({ id });
    }
    let imageKey: string | null = null;
    if (data.image) {
      const image = textField(data.image, 1500000),
        match = image.match(
          /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
        );
      if (!match)
        throw new HttpError(400, "Use a PNG, JPG or WebP reference image.");
      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      if (bytes.length > 1024 * 1024)
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
      imageKey = `references/${encodeURIComponent(owner)}/${id}`;
      await storage().put(imageKey, bytes.buffer, {
        httpMetadata: { contentType: `image/${match[1]}` },
      });
    }
    await database()
      .prepare(
        "INSERT INTO studio_references(id,owner,title,url,notes,tags,palette,image_key,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(
        id,
        owner,
        title,
        url,
        notes,
        JSON.stringify(data.tags),
        JSON.stringify(data.palette),
        imageKey,
        Date.now(),
      )
      .run();
    return json({ id }, 201);
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const account = await accountReferences(request);
    if (account) return account;
    sameOrigin(request);
    const owner = await identity(request),
      id = uuid(new URL(request.url).searchParams.get("id"));
    const deleted = await database()
      .prepare(
        "DELETE FROM studio_references WHERE id=? AND owner=? RETURNING image_key",
      )
      .bind(id, owner)
      .first<{ image_key: string | null }>();
    if (deleted?.image_key) await storage().delete(deleted.image_key);
    return json({ deleted: true });
  } catch (error) {
    return failure(error);
  }
}
