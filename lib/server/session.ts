export const SESSION_COOKIE = "__Host-threadform_studio_key";
/** Only local HTTP development uses a separate cookie. Production is always
 * Secure and host-prefixed, regardless of request Host/forwarded headers. */
export function sessionCookie(request: Request): {
  name: string;
  secure: boolean;
} {
  const url = new URL(request.url);
  const localDevelopment =
    process.env.NODE_ENV === "development" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "terminal.local"].includes(url.hostname);
  return {
    name: localDevelopment ? "threadform_development_key" : SESSION_COOKIE,
    secure: !localDevelopment,
  };
}
export function studioKey(request: Request): string | null {
  const name = sessionCookie(request).name;
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}
export async function sessionOwner(request: Request): Promise<string | null> {
  const key = studioKey(request);
  if (!key) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return (
    "studio:" +
    Array.from(new Uint8Array(digest), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export function newStudioKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
