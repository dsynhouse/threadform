import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
export async function readProjectDownload(
  descriptor: { url: string; bytes: number; sha256: string },
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const url = new URL(descriptor.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !Number.isSafeInteger(descriptor.bytes) ||
    descriptor.bytes < 1 ||
    descriptor.bytes > 8388608 ||
    !/^[0-9a-f]{64}$/.test(descriptor.sha256)
  )
    throw new Error("Invalid project download reference.");
  const response = await fetcher(url, {
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok || !response.body)
    throw new Error("The saved project download did not complete. Retry.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > descriptor.bytes) {
        await reader.cancel();
        throw new Error("Project download exceeded its recorded size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== descriptor.bytes)
    throw new Error("Project download was incomplete. Retry.");
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  if (bytesToHex(sha256(bytes)) !== descriptor.sha256)
    throw new Error("Project download checksum did not match. Retry.");
  return JSON.parse(new TextDecoder().decode(bytes));
}
