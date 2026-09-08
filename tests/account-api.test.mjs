import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const root = fileURLToPath(new URL("..", import.meta.url));
let authError = null,
  saveError = null,
  called = false,
  authMutation = false;
const owner = "10000000-0000-4000-8000-000000000001";
globalThis.__threadformAccountMock = () => ({
  client: {
    auth: {
      getUser: async () => ({
        data: { user: authError ? null : { id: owner } },
        error: authError,
      }),
      signUp: async () => {
        authMutation = true;
        return { data: {}, error: null };
      },
      updateUser: async () => {
        authMutation = true;
        return { data: {}, error: null };
      },
    },
    rpc: async () => {
      called = true;
      return { data: { revision: 1 }, error: saveError };
    },
  },
  finish: (response) => response,
});
const vite = await createServer({
  configFile: false,
  appType: "custom",
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  cacheDir: "node_modules/.cache/threadform-account-api",
  plugins: [
    {
      name: "account-provider-test-double",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          (source === "./supabase" && importer?.includes("/lib/server/")) ||
          source === root + "lib/server/supabase" ||
          source === root + "lib/server/supabase.ts"
        )
          return "\0account-provider";
        if (source === "@threadform/runtime") return "\0test-runtime";
      },
      load(id) {
        if (id === "\0account-provider")
          return "export const supabaseRequest = request => globalThis.__threadformAccountMock(request); export const supabaseConfig=()=>null;";
        if (id === "\0test-runtime") return "export const env = {};";
      },
    },
  ],
});
const { accountProjects } = await vite.ssrLoadModule(
  "/lib/server/supabase-projects.ts",
);
const accountRoutes = await vite.ssrLoadModule("/app/api/account/route.ts");
const assetRoutes = await vite.ssrLoadModule("/app/api/assets/route.ts");
const { accountReferences } = await vite.ssrLoadModule(
  "/lib/server/supabase-references.ts",
);
after(async () => {
  delete globalThis.__threadformAccountMock;
  await vite.close();
});
const origin = "https://studio.example";
function request(extra = {}) {
  return new Request(origin + "/api/projects", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "X-Threadform-Namespace": "account:" + owner,
      ...extra,
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      saveId: crypto.randomUUID(),
      expectedRevision: 0,
      project: {
        version: 1,
        name: "Account QA",
        width: 100,
        height: 100,
        hoopWidth: 100,
        hoopHeight: 100,
        fabric: "cotton",
        objects: [],
        notes: [],
        source: "manual",
      },
    }),
  });
}
test("provider outages remain retryable instead of becoming an expired session", async () => {
  for (const [status, expected] of [
    [401, 401],
    [403, 401],
    [500, 503],
    [503, 503],
  ]) {
    authError = { status, name: "AuthApiError" };
    called = false;
    const response = await accountProjects(request());
    assert.equal(response.status, expected);
    assert.equal(called, false);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  authError = null;
});
test("an identity outage cannot turn guest linking into a new signup or expire artwork and board access", async () => {
  authError = { status: 503, name: "AuthApiError" };
  authMutation = false;
  const signup = new Request(origin + "/api/account", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      action: "signup",
      email: "test@example.invalid",
      password: "local-test-only-password",
    }),
  });
  assert.equal((await accountRoutes.POST(signup)).status, 503);
  assert.equal(authMutation, false);
  assert.equal(
    (await assetRoutes.GET(new Request(origin + "/api/assets"))).status,
    503,
  );
  assert.equal(
    (await accountReferences(new Request(origin + "/api/references"))).status,
    503,
  );
  authError = null;
});
test("account save rate limits, conflicts, corrupt payloads and outages stay distinguishable", async () => {
  for (const [code, message, status] of [
    ["P0001", "Save rate exceeded", 429],
    ["40001", "Save conflict", 409],
    ["23505", "Save identifier reused", 409],
    ["22023", "Invalid project", 400],
    ["42501", "Unavailable", 404],
    ["XX000", "Provider failure", 503],
  ]) {
    saveError = { code, message };
    called = false;
    const response = await accountProjects(request());
    assert.equal(
      response.status,
      status,
      code + ": " + (await response.clone().text()),
    );
    assert.equal(called, true);
  }
  saveError = null;
});
test("cross-origin and stale-account requests cannot reach the account save transaction", async () => {
  for (const [headers, status] of [
    [{ origin: "https://attacker.example" }, 403],
    [{ "X-Threadform-Namespace": "account:someone-else" }, 409],
  ]) {
    called = false;
    assert.equal((await accountProjects(request(headers))).status, status);
    assert.equal(called, false);
  }
});
