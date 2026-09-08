import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { api } from "@/components/studio/controls";
import { createId } from "../embroidery/id";
export async function uploadArtwork(
  file: File,
  id = createId(),
  namespace?: string,
): Promise<string> {
  const hash = bytesToHex(sha256(new Uint8Array(await file.arrayBuffer())));
  const mime = file.name.toLowerCase().endsWith(".svg")
    ? "image/svg+xml"
    : file.type;
  const upload = await api<{
    id: string;
    existing?: boolean;
    url: string;
    publishableKey: string;
    bucket: string;
    path: string;
    token: string;
  }>("/api/assets", {
    method: "POST",
    headers: namespace ? { "X-Threadform-Namespace": namespace } : undefined,
    body: JSON.stringify({
      id,
      name: file.name,
      mime,
      bytes: file.size,
      sha256: hash,
    }),
  });
  if (!upload.existing) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(upload.url, upload.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, options) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(45000) }),
      },
    });
    const { error } = await client.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, file, {
        contentType: mime,
      });
    if (error)
      throw new Error(
        "The artwork upload did not complete. Your local copy remains available; retry.",
      );
  }
  return upload.id;
}
export async function openArtwork(id: string): Promise<File> {
  const file = await api<{
    url: string;
    name: string;
    mime: string;
    bytes: number;
    sha256: string;
  }>("/api/assets?id=" + id);
  const response = await fetch(file.url, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error("The original artwork download did not complete.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength !== file.bytes ||
    bytesToHex(sha256(bytes)) !== file.sha256
  )
    throw new Error(
      "The original artwork checksum did not match. Retry the download.",
    );
  return new File([bytes], file.name, { type: file.mime });
}
