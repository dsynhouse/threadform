import { supabaseRequest, supabaseConfig } from "@/lib/server/supabase";
import { assetRecord, ARTWORK_BUCKET } from "@/lib/server/assets";
import {
  sameOrigin,
  readJSON,
  json,
  failure,
  HttpError,
  uuid,
  textField,
} from "@/lib/server/http";
export async function POST(request: Request) {
  const auth = supabaseRequest(request);
  try {
    sameOrigin(request);
    if (!auth)
      throw new HttpError(
        503,
        "Cloud artwork storage is not connected yet. The local conversion draft remains available.",
      );
    const { data, error } = await auth.client.auth.getUser();
    if (error || !data.user)
      throw new HttpError(
        401,
        "Sign in to upload original artwork to your account.",
      );
    if (
      request.headers.has("X-Threadform-Namespace") &&
      request.headers.get("X-Threadform-Namespace") !==
        "account:" + data.user.id
    )
      throw new HttpError(
        409,
        "The signed-in account changed. Reopen its workspace before uploading artwork.",
      );
    const d = await readJSON(request, 4096),
      id = uuid(d.id),
      name = textField(d.name, 255),
      mime = textField(d.mime, 100),
      bytes = d.bytes,
      hash = textField(d.sha256, 64);
    if (
      !name ||
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/svg+xml",
        "application/json",
      ].includes(mime) ||
      typeof bytes !== "number" ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > 33554432 ||
      !/^[0-9a-f]{64}$/.test(hash)
    )
      throw new HttpError(
        400,
        "Invalid artwork upload. Use a supported file up to 32 MB.",
      );
    const owner = data.user.id,
      path = owner + "/" + id;
    const { data: existing, error: lookupError } = await auth.client
      .from("threadform_assets")
      .select("id,sha256,path,mime,bytes")
      .eq("id", id)
      .eq("owner", owner)
      .maybeSingle();
    if (lookupError)
      throw new HttpError(503, "Artwork storage needs its database migration.");
    if (
      existing &&
      (existing.sha256 !== hash ||
        existing.mime !== mime ||
        existing.bytes !== bytes)
    )
      throw new HttpError(
        409,
        "This upload identifier belongs to another file.",
      );
    if (existing) {
      const info = await auth.client.storage.from(ARTWORK_BUCKET).info(path);
      if (!info.error && info.data.size === bytes)
        return auth.finish(json({ id, existing: true }));
    } else {
      const inserted = await auth.client
        .from("threadform_assets")
        .insert({ id, owner, path, name, mime, bytes, sha256: hash });
      if (inserted.error)
        throw new HttpError(
          503,
          "The artwork upload could not be reserved. Retry.",
        );
    }
    const upload = await auth.client.storage
      .from(ARTWORK_BUCKET)
      .createSignedUploadUrl(path);
    if (upload.error)
      throw new HttpError(
        503,
        "The private artwork bucket could not accept this upload.",
      );
    const config = supabaseConfig()!;
    return auth.finish(
      json({
        id,
        path,
        token: upload.data.token,
        url: config.url,
        publishableKey: config.key,
        bucket: ARTWORK_BUCKET,
      }),
    );
  } catch (e) {
    const r = failure(e);
    return auth ? auth.finish(r) : r;
  }
}
export async function GET(request: Request) {
  const auth = supabaseRequest(request);
  try {
    if (!auth)
      throw new HttpError(503, "Cloud artwork storage is not connected.");
    const { data, error } = await auth.client.auth.getUser();
    if (error || !data.user)
      throw new HttpError(401, "Sign in to open your original artwork.");
    const row = await assetRecord(
      auth.client,
      data.user.id,
      new URL(request.url).searchParams.get("id") ?? "",
    );
    const signed = await auth.client.storage
      .from(ARTWORK_BUCKET)
      .createSignedUrl(row.path, 60, { download: row.name });
    if (signed.error)
      throw new HttpError(503, "The original artwork could not be opened.");
    return auth.finish(
      json({
        id: row.id,
        name: row.name,
        mime: row.mime,
        bytes: row.bytes,
        sha256: row.sha256,
        url: signed.data.signedUrl,
      }),
    );
  } catch (e) {
    const r = failure(e);
    return auth ? auth.finish(r) : r;
  }
}
