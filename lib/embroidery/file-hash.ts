import { sha256 } from "@noble/hashes/sha256";
/** Works in secure production browsers and HTTP previews. Known-vector tested. */
export function fileHash(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
}
