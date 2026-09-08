import { newStudioKey, sessionCookie, studioKey } from "@/lib/server/session";
import { env } from "@threadform/runtime";
import { supabaseRequest } from "@/lib/server/supabase";
import { failure } from "@/lib/server/http";
export async function GET(request: Request) {
  const current = studioKey(request),
    key = current ?? newStudioKey();
  const cookie = sessionCookie(request);
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (!current)
    headers.set(
      "Set-Cookie",
      `${cookie.name}=${key}; HttpOnly;${cookie.secure ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=31536000`,
    );
  const response = Response.json(
    { ready: true, mode: "private-browser-studio" },
    { headers },
  );
  if (env.THREADFORM_BACKEND !== "supabase") return response;
  const auth = supabaseRequest(request);
  if (!auth) return response;
  try {
    const { data, error } = await auth.client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError")
      return auth.finish(response);
    if (!data.user) {
      const guest = await auth.client.auth.signInAnonymously();
      // A disabled guest provider must not prevent the user from signing into
      // an existing account or working from a local recovery draft.
      if (guest.error) return auth.finish(response);
    }
    return auth.finish(response);
  } catch (error) {
    return auth.finish(failure(error));
  }
}
