import { supabaseRequest } from "@/lib/server/supabase";
export async function GET(request: Request) {
  const auth = supabaseRequest(request),
    url = new URL(request.url);
  if (!auth)
    return Response.redirect(new URL("/?account=unavailable", url.origin), 303);
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096)
    return auth.finish(
      Response.redirect(new URL("/?account=invalid", url.origin), 303),
    );
  let error: unknown;
  try {
    ({ error } = await auth.client.auth.exchangeCodeForSession(code));
  } catch (failure) {
    error = failure;
  }
  const result = error
    ? "invalid"
    : url.searchParams.get("setup") === "1"
      ? "setup"
      : url.searchParams.get("recovery") === "1"
        ? "recovery"
        : "confirmed";
  return auth.finish(
    Response.redirect(new URL("/?account=" + result, url.origin), 303),
  );
}
