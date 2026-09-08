import "./cloudflare-runtime.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  sql.exec(
    readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
  );
class Statement {
  constructor(query, values = []) {
    this.query = query;
    this.values = values;
  }
  bind(...values) {
    return new Statement(this.query, values);
  }
  async first(column) {
    const row = sql.prepare(this.query).get(...this.values);
    return column ? (row?.[column] ?? null) : (row ?? null);
  }
  async all() {
    const results = sql.prepare(this.query).all(...this.values);
    return {
      results,
      success: true,
      meta: { changes: Number(sql.prepare("SELECT changes() AS n").get().n) },
    };
  }
  async run() {
    return this.all();
  }
}
const DB = {
  prepare: (query) => new Statement(query),
  batch: async (statements) => {
    sql.exec("BEGIN");
    try {
      const out = [];
      for (const statement of statements) out.push(await statement.all());
      sql.exec("COMMIT");
      return out;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  },
};
const blobs = new Map();
const STORAGE = {
  put: async (key, value, options) => {
    blobs.set(key, { value, options });
  },
  get: async (key) => {
    const blob = blobs.get(key);
    if (!blob) return null;
    return {
      text: async () => blob.value,
      body: new Blob([blob.value]).stream(),
      httpMetadata: blob.options?.httpMetadata,
    };
  },
  delete: async (key) => {
    blobs.delete(key);
  },
};
globalThis.__threadformTestEnv = { DB, STORAGE };
const { default: worker } = await import("../dist/server/index.js");
const origin = "https://studio.example";
async function request(
  path,
  { method = "GET", cookie, body, requestOrigin = origin, namespace } = {},
) {
  const headers = new Headers({ accept: "application/json" });
  if (cookie) headers.set("cookie", cookie);
  if (method !== "GET") headers.set("origin", requestOrigin);
  if (body) headers.set("content-type", "application/json");
  if (namespace) headers.set("X-Threadform-Namespace", namespace);
  return worker.fetch(
    new Request(origin + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    }),
    globalThis.__threadformTestEnv,
    { waitUntil() {}, passThroughOnException() {} },
  );
}
const project = {
  version: 1,
  name: "Saved test",
  width: 15000,
  height: 24000,
  workspaceMode: "freeform",
  units: "in",
  hoopWidth: 100,
  hoopHeight: 100,
  fabric: "cotton",
  objects: [],
  notes: [],
  source: "manual",
};
let cookieA, cookieB, id, firstSave;
test("public visitors receive independent secure studio sessions without a login", async () => {
  const a = await request("/api/session"),
    b = await request("/api/session");
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.match(a.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
  cookieA = a.headers.get("set-cookie").split(";")[0];
  cookieB = b.headers.get("set-cookie").split(";")[0];
  assert.notEqual(cookieA, cookieB);
  assert.deepEqual(await a.json(), {
    ready: true,
    mode: "private-browser-studio",
  });
  const reuse = await request("/api/session", { cookie: cookieA });
  assert.equal(reuse.headers.get("set-cookie"), null);
});
test("unauthenticated and cross-origin writes cannot access project storage", async () => {
  const unauth = await request("/api/projects");
  assert.equal(unauth.status, 401);
  const cross = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    requestOrigin: "https://elsewhere.example",
    body: {},
  });
  assert.equal(cross.status, 403);
});
test("saved projects round-trip and remain private to the owning browser studio", async () => {
  id = crypto.randomUUID();
  firstSave = crypto.randomUUID();
  const response = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    body: { id, saveId: firstSave, expectedRevision: 0, project },
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), { id, revision: 1 });
  const saved = await request("/api/projects?id=" + id, { cookie: cookieA });
  assert.deepEqual((await saved.json()).project, project);
  const forbidden = await request("/api/projects?id=" + id, {
    cookie: cookieB,
  });
  assert.equal(forbidden.status, 404);
  const otherList = await request("/api/projects", { cookie: cookieB });
  assert.equal((await otherList.json()).projects.length, 0);
});
test("save retries are idempotent; stale edits cannot overwrite a newer revision", async () => {
  const retry = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    body: { id, saveId: firstSave, expectedRevision: 0, project },
  });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).revision, 1);
  const second = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    body: {
      id,
      saveId: crypto.randomUUID(),
      expectedRevision: 1,
      project: { ...project, name: "Revision two" },
    },
  });
  assert.equal(second.status, 200);
  const stale = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    body: {
      id,
      saveId: crypto.randomUUID(),
      expectedRevision: 1,
      project: { ...project, name: "Stale" },
    },
  });
  assert.equal(stale.status, 409);
  const latest = await request("/api/projects?id=" + id, { cookie: cookieA });
  assert.equal((await latest.json()).project.name, "Revision two");
  const previous = await request("/api/projects?id=" + id + "&revision=1", {
    cookie: cookieA,
  });
  const previousData = await previous.json();
  assert.equal(previousData.project.name, project.name);
  assert.equal(previousData.revision, 2);
  const history = await request("/api/projects?id=" + id + "&history=1", {
    cookie: cookieA,
  });
  assert.deepEqual(
    (await history.json()).history.map((v) => v.revision),
    [2, 1],
  );
});
test("reference storage rejects unsafe links and respects owner boundaries", async () => {
  const refId = crypto.randomUUID(),
    reference = {
      id: refId,
      title: "Palette note",
      url: "https://www.pinterest.com/",
      notes: "Jade and clay",
      tags: ["botanical"],
      palette: ["#21776a"],
    };
  const unsafe = await request("/api/references", {
    method: "POST",
    cookie: cookieA,
    body: { ...reference, url: "javascript:alert(1)" },
  });
  assert.equal(unsafe.status, 400);
  const saved = await request("/api/references", {
    method: "POST",
    cookie: cookieA,
    body: reference,
  });
  assert.equal(saved.status, 201);
  const a = await request("/api/references", { cookie: cookieA }),
    b = await request("/api/references", { cookie: cookieB });
  assert.equal((await a.json()).references.length, 1);
  assert.equal((await b.json()).references.length, 0);
  await request("/api/references?id=" + refId, {
    method: "DELETE",
    cookie: cookieB,
  });
  assert.equal(
    (await (await request("/api/references", { cookie: cookieA })).json())
      .references.length,
    1,
  );
  await request("/api/references?id=" + refId, {
    method: "DELETE",
    cookie: cookieA,
  });
  assert.equal(
    (await (await request("/api/references", { cookie: cookieA })).json())
      .references.length,
    0,
  );
});
test("unconfigured Pinterest sync returns an honest connection state", async () => {
  const result = await request("/api/integrations/pinterest", {
    cookie: cookieA,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    configured: false,
    connected: false,
  });
  const connect = await request("/api/integrations/pinterest", {
    method: "POST",
    cookie: cookieA,
  });
  assert.equal(connect.status, 503);
});

test("production keeps host-prefixed secure cookies even for a local-looking HTTP host", async () => {
  const response = await worker.fetch(
    new Request("http://terminal.local/api/session"),
    globalThis.__threadformTestEnv,
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("set-cookie"),
    /^__Host-threadform_studio_key=/,
  );
  assert.match(
    response.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Lax/,
  );
});
test("unconfigured Supabase preserves guest designing and reports account setup honestly", async () => {
  const status = await request("/api/account", { cookie: cookieA });
  assert.equal(status.status, 200);
  const account = await status.json();
  assert.equal(account.configured, false);
  assert.equal(account.user, null);
  assert.match(account.namespace, /^studio:[a-f0-9]{64}$/);
  const login = await request("/api/account", {
    method: "POST",
    cookie: cookieA,
    body: { action: "login" },
  });
  assert.equal(login.status, 503);
  const cross = await request("/api/account", {
    method: "POST",
    cookie: cookieA,
    requestOrigin: "https://elsewhere.example",
    body: { action: "login" },
  });
  assert.equal(cross.status, 403);
});

test("an account change rejects a queued save from another workspace", async () => {
  const other = await (
    await request("/api/account", { cookie: cookieB })
  ).json();
  const result = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    namespace: other.namespace,
    body: {
      id: crypto.randomUUID(),
      saveId: crypto.randomUUID(),
      expectedRevision: 0,
      project,
    },
  });
  assert.equal(result.status, 409);
});
test("an older acknowledged save remains idempotent and rejects changed payloads", async () => {
  const retry = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    body: { id, saveId: firstSave, expectedRevision: 0, project },
  });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).revision, 1);
  const changed = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    body: {
      id,
      saveId: firstSave,
      expectedRevision: 0,
      project: { ...project, name: "Changed retry" },
    },
  });
  assert.equal(changed.status, 409);
});
test("guest projects can keep saving after revision 500", async () => {
  sql.prepare("UPDATE studio_projects SET revision=500 WHERE id=?").run(id);
  const result = await request("/api/projects", {
    method: "POST",
    cookie: cookieA,
    body: { id, saveId: crypto.randomUUID(), expectedRevision: 500, project },
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).revision, 501);
});
