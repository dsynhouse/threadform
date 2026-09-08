import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http";

/** An unavailable identity service is never equivalent to a signed-out user. */
export async function verifiedUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError")
    throw new HttpError(
      [400, 401, 403].includes(error.status ?? 0) ? 401 : 503,
      "Your account could not be verified. Retry, or sign in again if the session expired.",
    );
  return data.user;
}
