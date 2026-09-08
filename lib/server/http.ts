import { sessionOwner } from "./session";
import { env } from "@threadform/runtime";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function identity(request: Request): Promise<string> {
  const owner = await sessionOwner(request);
  if (!owner)
    throw new HttpError(
      401,
      "Your private studio session needs to be initialized. Please retry.",
    );
  return owner;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin"),
    expected = new URL(request.url).origin;
  if (
    !origin ||
    origin !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(403, "This action must come from your studio.");
}
export function database(): D1Database {
  if (!env.DB)
    throw new HttpError(
      503,
      "Project storage is temporarily unavailable. Keep your design open or download a local copy.",
    );
  return env.DB;
}
export function storage(): StudioBucket {
  if (!env.STORAGE)
    throw new HttpError(
      503,
      "File storage is temporarily unavailable. Keep your design open or download a local copy.",
    );
  return env.STORAGE;
}
export async function readJSON(
  request: Request,
  limit = 8 * 1024 * 1024,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Expected a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new HttpError(
          413,
          "The project is too large to save. Download a local copy or simplify the artwork.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "The request contains invalid JSON.");
  }
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function failure(error: unknown): Response {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  console.error(
    "Studio request failed",
    error instanceof Error ? error.message : "Unknown failure",
  );
  return json(
    {
      error:
        "The studio could not complete this request. Your open work is preserved; please retry.",
    },
    503,
  );
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new HttpError(400, "Invalid record identifier.");
  return value;
}
export function textField(value: unknown, max: number, fallback = ""): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max)
    throw new HttpError(400, "A text field is too long or invalid.");
  return value.trim();
}
export function safeURL(value: unknown): string {
  const source = textField(value, 2000);
  if (!source) return "";
  try {
    const url = new URL(source);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.href;
  } catch {
    throw new HttpError(400, "Use a complete http or https reference link.");
  }
}
export async function limitWrites(owner: string) {
  const window = Math.floor(Date.now() / 60000);
  const result = await database()
    .prepare(
      "INSERT INTO studio_write_limits(owner,window,count) VALUES(?,?,1) ON CONFLICT(owner) DO UPDATE SET count=CASE WHEN studio_write_limits.window=excluded.window THEN studio_write_limits.count+1 ELSE 1 END,window=excluded.window RETURNING count",
    )
    .bind(owner, window)
    .first<{ count: number }>();
  if ((result?.count ?? 0) > 40)
    throw new HttpError(
      429,
      "Too many saves in a short time. Keep your work open and try again in a minute.",
    );
}
