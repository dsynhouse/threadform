import { supabaseRequest } from "@/lib/server/supabase";
import { verifiedUser } from "@/lib/server/verified-user";
import { sessionOwner } from "@/lib/server/session";
import { env } from "@threadform/runtime";
import {
  identity,
  limitWrites,
  sameOrigin,
  readJSON,
  json,
  failure,
  HttpError,
  textField,
} from "@/lib/server/http";
export async function GET(request: Request) {
  try {
    const auth = supabaseRequest(request);
    const guest = await sessionOwner(request);
    if (!auth) return json({ configured: false, user: null, namespace: guest });
    const data = { user: await verifiedUser(auth.client) };
    return auth.finish(
      json({
        configured: true,
        guestAccount: !!data.user?.is_anonymous,
        namespace: data.user ? "account:" + data.user.id : guest,
        user:
          data.user && !data.user.is_anonymous
            ? { id: data.user.id, email: data.user.email }
            : null,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  let auth: ReturnType<typeof supabaseRequest> = null;
  try {
    sameOrigin(request);
    auth = supabaseRequest(request);
    if (!auth)
      throw new HttpError(
        503,
        "Account sign-in is not configured yet. Your guest studio remains available.",
      );
    // Standalone authentication uses Supabase Auth's own rate limits. A D1
    // binding must never be required to sign in on Vercel.
    if (env.DB) await limitWrites(await identity(request));
    const currentAccount = { user: await verifiedUser(auth.client) };
    const d = await readJSON(request, 8192),
      action = textField(d.action, 30),
      email = textField(d.email, 254),
      origin = new URL(request.url).origin;
    if (
      d.password !== undefined &&
      (typeof d.password !== "string" || d.password.length > 128)
    )
      throw new HttpError(400, "Invalid password length.");
    const password = typeof d.password === "string" ? d.password : "";
    if (
      ["login", "signup", "recover"].includes(action) &&
      !/^\S+@\S+\.\S+$/.test(email)
    )
      throw new HttpError(400, "Enter a valid email address.");
    if (
      (action === "password" ||
        (action === "signup" && !currentAccount.user?.is_anonymous)) &&
      password.length < 12
    )
      throw new HttpError(400, "Use a password with at least 12 characters.");
    let result;
    if (action === "login")
      result = await auth.client.auth.signInWithPassword({ email, password });
    else if (action === "signup" && currentAccount.user?.is_anonymous)
      result = await auth.client.auth.updateUser(
        { email },
        { emailRedirectTo: origin + "/auth/callback?setup=1" },
      );
    else if (action === "signup")
      result = await auth.client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: origin + "/auth/callback" },
      });
    else if (action === "recover")
      result = await auth.client.auth.resetPasswordForEmail(email, {
        redirectTo: origin + "/auth/callback?recovery=1",
      });
    else if (action === "logout")
      result = await auth.client.auth.signOut({ scope: "local" });
    else if (action === "password") {
      if (!currentAccount.user)
        throw new HttpError(
          401,
          "Open the password reset link in your email first.",
        );
      result = await auth.client.auth.updateUser({ password });
    } else throw new HttpError(400, "Unknown account action.");
    if (result.error)
      throw new HttpError(
        result.error.status === 429 ? 429 : 400,
        action === "login"
          ? "Unable to sign in. Check your email and password, or reset your password."
          : result.error.status === 429
            ? "Too many attempts. Please try again later."
            : "The account request could not be completed. Check the email address and try again.",
      );
    const message =
      action === "signup"
        ? currentAccount.user?.is_anonymous
          ? "Confirm your email, then choose a password. Your guest designs stay with this account."
          : "Check your email to confirm your account."
        : action === "recover"
          ? "If an account exists, a password reset email will arrive shortly."
          : action === "password"
            ? "Password updated."
            : action === "logout"
              ? "Signed out on this device."
              : "Signed in.";
    return auth.finish(json({ ok: true, message }));
  } catch (e) {
    const response = failure(e);
    return auth ? auth.finish(response) : response;
  }
}
