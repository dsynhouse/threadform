import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("standalone launch loads production environment precedence and serves copied assets", () => {
  const root = mkdtempSync(join(tmpdir(), "threadform-host-"));
  try {
    for (const path of [
      "scripts",
      ".next/standalone",
      ".next/static",
      "public",
    ])
      mkdirSync(join(root, path), { recursive: true });
    symlinkSync(resolve("node_modules"), join(root, "node_modules"));
    writeFileSync(join(root, "package.json"), '{"type":"module"}');
    copyFileSync(
      "scripts/start-standalone.mjs",
      join(root, "scripts/start-standalone.mjs"),
    );
    writeFileSync(
      join(root, ".env"),
      "THREADFORM_QA_MODE=base\nTHREADFORM_QA_BASE=studio\n",
    );
    writeFileSync(join(root, ".env.local"), "THREADFORM_QA_MODE=local\n");
    writeFileSync(
      join(root, ".env.production"),
      "THREADFORM_QA_PRODUCTION=enabled\n",
    );
    writeFileSync(
      join(root, ".env.production.local"),
      "THREADFORM_QA_MODE=production-local\nTHREADFORM_QA_BASE=studio\nTHREADFORM_QA_EXPANDED=${THREADFORM_QA_BASE}/assets\nTHREADFORM_QA_OVERRIDE=file\n",
    );
    writeFileSync(join(root, "public/logo.svg"), "logo");
    writeFileSync(join(root, ".next/static/app.js"), "bundle");
    writeFileSync(
      join(root, ".next/standalone/server.js"),
      `
      import {readFileSync} from 'node:fs';
      console.log(JSON.stringify({
        mode:process.env.THREADFORM_QA_MODE,
        production:process.env.THREADFORM_QA_PRODUCTION,
        expanded:process.env.THREADFORM_QA_EXPANDED,
        override:process.env.THREADFORM_QA_OVERRIDE,
        nodeEnv:process.env.NODE_ENV,
        logo:readFileSync('public/logo.svg','utf8'),
        bundle:readFileSync('.next/static/app.js','utf8')
      }));
    `,
    );
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/start-standalone.mjs")],
      {
        encoding: "utf8",
        timeout: 10000,
        env: { ...process.env, THREADFORM_QA_OVERRIDE: "runtime" },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      mode: "production-local",
      production: "enabled",
      expanded: "studio/assets",
      override: "runtime",
      nodeEnv: "production",
      logo: "logo",
      bundle: "bundle",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
