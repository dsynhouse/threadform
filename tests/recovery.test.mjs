import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  configFile: false,
  appType: "custom",
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  cacheDir: "node_modules/.cache/threadform-recovery",
});
const { rememberArtwork } = await vite.ssrLoadModule("/lib/client/recovery.ts");
const previous = globalThis.indexedDB;
after(async () => {
  globalThis.indexedDB = previous;
  await vite.close();
});
const writes = [];
function dbMock() {
  return {
    closed: false,
    close() {
      this.closed = true;
    },
    transaction() {
      const tx = {
        objectStore: () => ({
          put(value) {
            writes.push(value);
            queueMicrotask(() => tx.oncomplete());
          },
        }),
      };
      return tx;
    },
  };
}
let current;
test("local recovery retries after browser storage initially throws SecurityError", async () => {
  globalThis.indexedDB = {
    open() {
      throw new DOMException("Storage denied", "SecurityError");
    },
  };
  await assert.rejects(
    rememberArtwork("guest-a", "art", new File(["art"], "art.svg")),
    /Storage denied/,
  );
  current = dbMock();
  globalThis.indexedDB = {
    open() {
      const request = { result: current };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  await rememberArtwork("guest-a", "art", new File(["art"], "art.svg"));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].namespace, "guest-a");
  current.onversionchange();
  assert.equal(current.closed, true);
});
test("an abandoned blocked upgrade closes its late connection and allows recovery to reopen", async () => {
  const abandoned = dbMock();
  let blocked;
  globalThis.indexedDB = {
    open() {
      blocked = { result: abandoned };
      queueMicrotask(() => blocked.onblocked());
      return blocked;
    },
  };
  await assert.rejects(
    rememberArtwork("guest-b", "art", new File(["art"], "art.svg")),
    /Close older studio tabs/,
  );
  blocked.onsuccess();
  assert.equal(abandoned.closed, true);
  current = dbMock();
  globalThis.indexedDB = {
    open() {
      const request = { result: current };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
  await rememberArtwork("guest-b", "art", new File(["other"], "art.svg"));
  assert.equal(writes.length, 2);
  assert.notEqual(writes[0].key, writes[1].key);
  current.onversionchange();
});
