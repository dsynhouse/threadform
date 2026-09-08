"use client";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, errorMessage, resetStudioSession } from "./controls";
type AccountState = {
  configured: boolean;
  guestAccount?: boolean;
  user: { id: string; email: string } | null;
};
export default function Account() {
  const [state, setState] = useState<AccountState | null>(null),
    [open, setOpen] = useState(false),
    [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () =>
      api<AccountState>("/api/account")
        .then(setState)
        .catch(() => {
          setState((previous) => previous ?? { configured: true, user: null });
          setMessage(
            "Account status could not be loaded. You can retry signing in.",
          );
        });
    void refresh().then(() => {
      const query = new URL(location.href).searchParams.get("account");
      if (query) {
        setOpen(true);
        if (query === "recovery" || query === "setup") setMode("password");
        else
          setMessage(
            query === "confirmed"
              ? "Email confirmed. Your account is ready."
              : "The sign-in link is invalid or expired. Request a new one.",
          );
        const clean = new URL(location.href);
        clean.searchParams.delete("account");
        history.replaceState(null, "", clean.pathname + clean.search);
      }
    });
    const timer = setInterval(() => void refresh(), 60000);
    return () => clearInterval(timer);
  }, []);
  async function submit(action = mode) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ message: string }>("/api/account", {
        method: "POST",
        body: JSON.stringify({ action, email, password }),
      });
      setPassword("");
      setMessage(result.message);
      if (action === "logout" || action === "login") {
        resetStudioSession();
        window.dispatchEvent(new CustomEvent("threadform:account-changed"));
        try {
          localStorage.setItem("threadform-account-change", String(Date.now()));
        } catch {
          /* Cross-tab notification is optional. */
        }
      }
      const next = await api<AccountState>("/api/account");
      setState(next);
      if (
        action !== "login" &&
        action !== "logout" &&
        next.user?.id !== state?.user?.id
      )
        window.dispatchEvent(
          new CustomEvent("threadform:account-changed", {
            detail: { signedIn: !!next.user, userId: next.user?.id ?? null },
          }),
        );
      if (action === "login" || action === "logout") {
        setOpen(false);
        toast.success(result.message);
      }
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="top-button"
        onClick={() => setOpen(true)}
        aria-label="Your account"
      >
        <UserRound size={16} />
        <span>{state?.user ? "Account" : "Sign in"}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="account-dialog">
          <DialogHeader>
            <DialogTitle>
              {state?.user
                ? "Your studio account"
                : mode === "signup"
                  ? "Create your account"
                  : mode === "recover"
                    ? "Reset your password"
                    : mode === "password"
                      ? "Choose a new password"
                      : "Welcome to your studio"}
            </DialogTitle>
            <DialogDescription>
              Save designs across devices with your own account. Guest designing
              stays open to everyone.
            </DialogDescription>
          </DialogHeader>
          {!state ? (
            <p role="status">Checking account availability…</p>
          ) : !state.configured ? (
            <p>
              Account sign-in is being set up. You can keep designing, save to
              this guest studio and download your projects.
            </p>
          ) : state.user && mode !== "password" ? (
            <div className="account-form">
              <p>{state.user.email}</p>
              <p>
                Account projects are private to you. Guest projects remain in
                the browser studio where they were created.
              </p>
              <button
                className="button"
                onClick={() => {
                  setMode("password");
                  setMessage("");
                }}
              >
                Change password
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => void submit("logout")}
              >
                Sign out on this device
              </button>
            </div>
          ) : (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {mode !== "password" && (
                <label>
                  Email
                  <input
                    className="text-input"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {mode !== "recover" &&
                !(mode === "signup" && state.guestAccount) && (
                  <label>
                    {mode === "password" ? "New password" : "Password"}
                    <input
                      className="text-input"
                      type="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      required
                      minLength={mode === "login" ? 1 : 12}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                )}
              {mode === "signup" && (
                <p className="help-text">
                  {state.guestAccount
                    ? "Confirm your email first. You will then choose a password, keeping your guest designs."
                    : "Use at least 12 characters. Confirm your email before your first sign-in."}
                </p>
              )}
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "recover"
                      ? "Send reset email"
                      : mode === "password"
                        ? "Update password"
                        : "Sign in"}
              </button>
              <div className="row">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    setMessage("");
                  }}
                >
                  {mode === "login" ? "Create an account" : "Back to sign in"}
                </button>
                {mode === "login" && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setMode("recover")}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </form>
          )}
          {message && <p role="status">{message}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
