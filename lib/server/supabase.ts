import { env } from "@threadform/runtime";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { sessionCookie } from "./session";
/** User sessions stay in HttpOnly cookies. Only the public API key is exposed for signed uploads. */
export function supabaseConfig() {
  const values = env as unknown as Record<string, string | undefined>;
  const url = values.SUPABASE_URL ?? process.env.SUPABASE_URL,
    key =
      values.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("Invalid Supabase URL configuration.");
  if (!key.startsWith("sb_publishable_")) {
    let role: unknown;
    try {
      const part = key.split(".")[1];
      role = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).role;
    } catch {
      /* Invalid legacy key. */
    }
    if (role !== "anon")
      throw new Error(
        "Use a Supabase publishable or legacy anon key, never a secret/service-role key.",
      );
  }
  return { url: parsed.origin, key };
}
export function supabaseRequest(request: Request) {
  const config = supabaseConfig();
  if (!config) return null;
  const jar = new Map<string, string>();
  for (const cookie of (request.headers.get("cookie") ?? "").split(";")) {
    const at = cookie.indexOf("=");
    if (at < 0) continue;
    try {
      jar.set(
        cookie.slice(0, at).trim(),
        decodeURIComponent(cookie.slice(at + 1)),
      );
    } catch {
      /* Ignore malformed cookie. */
    }
  }
  const changes: { name: string; value: string; options: CookieOptions }[] = [];
  const secure = sessionCookie(request).secure;
  const client = createServerClient(config.url, config.key, {
    cookieOptions: {
      name: secure
        ? "__Host-threadform_account"
        : "threadform_development_account",
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (updates) => {
        for (const c of updates) {
          jar.set(c.name, c.value);
          changes.push(c);
        }
      },
    },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    },
  });
  const finish = (response: Response) => {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    for (const c of changes) {
      const maxAge =
        c.options.maxAge === undefined
          ? 31536000
          : Math.floor(c.options.maxAge);
      headers.append(
        "Set-Cookie",
        `${c.name}=${encodeURIComponent(c.value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
      );
    }
    return new Response(response.body, { status: response.status, headers });
  };
  return { client, finish };
}
