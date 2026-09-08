import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

/** Vercel caps response bodies too. Large reads use an owner-scoped signed file. */
export async function projectDelivery(
  client: SupabaseClient,
  owner: string,
  project: unknown,
) {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  if (bytes.length <= 2 * 1024 * 1024) return { project };
  if (bytes.length > 8388608)
    throw new Error("The saved project exceeds snapshot delivery storage.");
  const hash = bytesToHex(sha256(bytes)),
    path = owner + "/snapshot-" + hash + ".json";
  const bucket = client.storage.from("threadform-artwork");
  const info = await bucket.info(path);
  if (info.error) {
    const uploaded = await bucket.upload(path, bytes, {
      contentType: "application/json",
      cacheControl: "0",
    });
    if (uploaded.error) {
      const raced = await bucket.info(path);
      if (raced.error || raced.data.size !== bytes.length)
        throw new Error(
          "The saved project could not be prepared for download. Retry.",
        );
    }
  }
  const signed = await bucket.createSignedUrl(path, 60);
  if (signed.error)
    throw new Error(
      "The saved project download could not be authorized. Retry.",
    );
  return {
    projectDownload: {
      url: signed.data.signedUrl,
      bytes: bytes.length,
      sha256: hash,
    },
  };
}
