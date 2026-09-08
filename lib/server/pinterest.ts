import { env } from "@threadform/runtime";
import { database, HttpError } from "./http";
export function pinterestConfig() {
  const {
    PINTEREST_APP_ID: id,
    PINTEREST_APP_SECRET: secret,
    PINTEREST_REDIRECT_URI: redirect,
    INTEGRATION_ENCRYPTION_KEY: key,
  } = env;
  if (!id || !secret || !redirect || !key) return null;
  try {
    if (new URL(redirect).protocol !== "https:" || atob(key).length !== 32)
      return null;
  } catch {
    return null;
  }
  return { id, secret, redirect, key };
}
async function encryptionKey() {
  const config = pinterestConfig();
  if (!config)
    throw new HttpError(
      503,
      "Pinterest account sync needs app credentials. Public inspiration search and saved references are available.",
    );
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(config.key), (c) => c.charCodeAt(0)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptToken(value: unknown, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await encryptionKey(),
    encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
  const bytes = new Uint8Array(12 + encrypted.byteLength);
  bytes.set(iv);
  bytes.set(new Uint8Array(encrypted), 12);
  return btoa(String.fromCharCode(...bytes));
}
async function decryptToken(value: string, owner: string): Promise<Token> {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes.slice(0, 12),
      additionalData: new TextEncoder().encode(owner),
    },
    await encryptionKey(),
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}
export type Token = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};
export async function exchange(parameters: URLSearchParams): Promise<Token> {
  const config = pinterestConfig();
  if (!config)
    throw new HttpError(503, "Pinterest account sync is not configured.");
  const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(config.id + ":" + config.secret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: parameters,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "Pinterest could not authorize this connection. Please connect again.",
    );
  const token: unknown = await response.json();
  if (
    !token ||
    typeof token !== "object" ||
    !("access_token" in token) ||
    typeof token.access_token !== "string" ||
    token.access_token.length > 16000
  )
    throw new HttpError(
      502,
      "Pinterest returned an invalid authorization response.",
    );
  const t = token as Token;
  return {
    access_token: t.access_token,
    ...(typeof t.refresh_token === "string"
      ? { refresh_token: t.refresh_token }
      : {}),
    expires_in:
      typeof t.expires_in === "number" && Number.isFinite(t.expires_in)
        ? Math.max(60, t.expires_in)
        : 3600,
  };
}
export async function accessToken(owner: string) {
  const db = database(),
    record = await db
      .prepare(
        "SELECT encrypted_token,expires_at FROM studio_connections WHERE owner=?",
      )
      .bind(owner)
      .first<{ encrypted_token: string; expires_at: number }>();
  if (!record)
    throw new HttpError(
      409,
      "Connect your Pinterest account to browse your boards.",
    );
  let token = await decryptToken(record.encrypted_token, owner);
  if (record.expires_at < Date.now() + 60000) {
    if (!token.refresh_token)
      throw new HttpError(
        409,
        "Your Pinterest connection expired. Connect again.",
      );
    const refreshed = await exchange(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
      }),
    );
    token = {
      ...refreshed,
      refresh_token: refreshed.refresh_token ?? token.refresh_token,
    };
    await db
      .prepare(
        "UPDATE studio_connections SET encrypted_token=?,expires_at=?,updated_at=? WHERE owner=? AND encrypted_token=?",
      )
      .bind(
        await encryptToken(token, owner),
        Date.now() + token.expires_in * 1000,
        Date.now(),
        owner,
        record.encrypted_token,
      )
      .run();
  }
  return token.access_token;
}
export async function pinterestRead(owner: string, path: string) {
  const token = await accessToken(owner);
  const response = await fetch(`https://api.pinterest.com/v5/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 429)
    throw new HttpError(
      429,
      "Pinterest is limiting requests. Try again shortly.",
    );
  if (response.status === 401 || response.status === 403)
    throw new HttpError(
      409,
      "Pinterest could not read these boards. Check your app access and reconnect.",
    );
  if (!response.ok)
    throw new HttpError(
      502,
      "Pinterest is temporarily unavailable. Your saved references are still available.",
    );
  return response.json() as Promise<{
    items?: Record<string, unknown>[];
    bookmark?: string;
  }>;
}
