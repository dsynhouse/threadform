import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { HttpError, uuid } from "./http";
export const ARTWORK_BUCKET = "threadform-artwork";
export async function assetRecord(
  client: SupabaseClient,
  owner: string,
  id: string,
) {
  const { data, error } = await client
    .from("threadform_assets")
    .select("id,name,mime,bytes,sha256,path")
    .eq("id", uuid(id))
    .eq("owner", owner)
    .maybeSingle();
  if (error) throw new HttpError(503, "Artwork storage is unavailable.");
  if (!data) throw new HttpError(404, "This artwork file is unavailable.");
  return data;
}
export async function projectSnapshot(
  client: SupabaseClient,
  owner: string,
  id: string,
): Promise<unknown> {
  const row = await assetRecord(client, owner, id);
  if (row.mime !== "application/json" || row.bytes > 8388608)
    throw new HttpError(400, "Invalid project snapshot.");
  const { data, error } = await client.storage
    .from(ARTWORK_BUCKET)
    .download(row.path);
  if (error || !data)
    throw new HttpError(
      503,
      "The uploaded project snapshot could not be read. Retry the save.",
    );
  if (data.size !== row.bytes)
    throw new HttpError(400, "Project upload was incomplete.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytesToHex(sha256(bytes)) !== row.sha256)
    throw new HttpError(400, "Project upload checksum did not match.");
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Project upload was not valid JSON.");
  }
}
