import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-transfers-"));
const result = spawnSync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    "--target",
    "ES2022",
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--outDir",
    out,
    "lib/server/project-delivery.ts",
    "lib/client/project-download.ts",
  ],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const require = createRequire(import.meta.url),
  { projectDelivery } = require(join(out, "server/project-delivery.js")),
  { readProjectDownload } = require(join(out, "client/project-download.js"));
const owner = "10000000-0000-4000-8000-000000000001",
  files = new Map();
let uploaded = 0;
const client = {
  storage: {
    from: (bucket) => {
      assert.equal(bucket, "threadform-artwork");
      return {
        info: async (path) =>
          files.has(path)
            ? { data: { size: files.get(path).length }, error: null }
            : { data: null, error: { message: "not found" } },
        upload: async (path, bytes) => {
          assert.ok(path.startsWith(owner + "/"));
          files.set(path, bytes);
          uploaded++;
          return { error: null };
        },
        createSignedUrl: async (path) => ({
          error: null,
          data: { signedUrl: "https://storage.example/" + path },
        }),
      };
    },
  },
};
const small = { name: "Small", objects: [] };
assert.deepEqual(await projectDelivery(client, owner, small), {
  project: small,
});
assert.equal(uploaded, 0);
console.log("PASS Small project reads stay in the ordinary API response");
const large = { name: "Large", source: "x".repeat(5 * 1024 * 1024) },
  delivery = await projectDelivery(client, owner, large);
assert.equal(delivery.project, undefined);
assert.ok(JSON.stringify(delivery).length < 1000);
const fetcher = async (url) =>
  new Response(files.get(new URL(url).pathname.slice(1)));
assert.deepEqual(
  await readProjectDownload(delivery.projectDownload, fetcher),
  large,
);
assert.equal(uploaded, 1);
await projectDelivery(client, owner, large);
assert.equal(uploaded, 1);
console.log(
  "PASS A 5 MB snapshot bypasses response limits, reopens exactly and reuses its private cache",
);
await assert.rejects(
  readProjectDownload(
    delivery.projectDownload,
    async () => new Response("short"),
  ),
  /incomplete/,
);
const corrupt = new Uint8Array([...files.values()][0]);
corrupt[20] ^= 1;
await assert.rejects(
  readProjectDownload(
    delivery.projectDownload,
    async () => new Response(corrupt),
  ),
  /checksum/,
);
await assert.rejects(
  readProjectDownload(
    { ...delivery.projectDownload, url: "http://unsafe.example" },
    fetcher,
  ),
  /Invalid/,
);
console.log(
  "PASS Interrupted, corrupt and unsafe project downloads fail without accepting a partial design",
);
rmSync(out, { recursive: true, force: true });
console.log("3 project transfer checks passed.");
