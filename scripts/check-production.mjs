import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-production-"));
const c = spawnSync(
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
    "lib/embroidery/native-export.ts",
    "lib/embroidery/engine.ts",
    "lib/embroidery/samples.ts",
  ],
  { encoding: "utf8" },
);
assert.equal(c.status, 0, c.stdout + c.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const req = createRequire(import.meta.url),
  get = (n) => req(join(out, n + ".js"));
const { generatePlan } = get("engine"),
  { makeObject } = get("types"),
  { exportNative, exportMachineBundle } = get("native-export"),
  { validateProject, validateThread } = get("project"),
  { machineStream, splitMachineMoves } = get("machine-stream"),
  { editNodes, insertNode, removeNodes, curvePaths } = get("reshape"),
  { transformObject, designFingerprint } = get("operations"),
  { importThreadLibrary, exportThreadLibrary } = get("threads");
const obj = (id, x, y, color) =>
  makeObject({
    id,
    name: id,
    paths: [
      [
        { x, y },
        { x: x + 17.3, y: y + 1.7 },
        { x: x + 18.1, y: y + 10.3 },
        { x: x + 3.2, y: y + 13 },
      ],
    ],
    closed: [true],
    type: "tatami",
    color,
    underlay: false,
    pull: 0,
  });
const project = {
  version: 1,
  name: "Format QA",
  width: 100,
  height: 90,
  hoopWidth: 200,
  hoopHeight: 200,
  workspaceMode: "freeform",
  autoStart: "custom",
  startPoint: { x: 49, y: 44 },
  source: "manual",
  fabric: "cotton",
  notes: [],
  objects: [obj("a", 23, 18, "#bf221d"), obj("b", 54, 40, "#193399")],
};
let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log("PASS", name);
};
const plan = generatePlan(project);
for (const format of ["dst", "pes", "jef", "exp"])
  await test(`${format.toUpperCase()} independently decoded coordinates, commands and end marker`, () => {
    const file = join(out, "check." + format);
    writeFileSync(file, exportNative(project, plan, format));
    const r = spawnSync("python", ["tests/decode-machine.py", file], {
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(r.status, 0, r.stderr);
    const decoded = JSON.parse(r.stdout),
      needles = decoded.stitches
        .filter((s) => (s[2] & 255) === 0)
        .map((s) => s.slice(0, 2));
    const expected = machineStream(project, plan, format)
      .filter((s) => s.command === "stitch")
      .map((s) => [s.x, s.y]);
    assert.deepEqual(needles, expected);
    assert.equal(
      decoded.stitches.filter((s) => (s[2] & 255) === 5).length,
      plan.colorChanges,
    );
    assert.equal(decoded.stitches.at(-1)[2] & 255, 4);
    if (format === "pes" || format === "jef")
      assert.equal(decoded.threads.length, 2);
  });
await test("Native movement subdivision retains endpoints without signed-byte wrapping", () => {
  const records = splitMachineMoves(
    [
      { command: "jump", x: 1703, y: -1221, color: "#000000" },
      { command: "stitch", x: -783, y: 977, color: "#000000" },
    ],
    127,
  );
  let x = 0,
    y = 0;
  for (const r of records) {
    assert.ok(Math.abs(r.x - x) <= 127 && Math.abs(r.y - y) <= 127);
    x = r.x;
    y = r.y;
  }
  assert.equal(x, -783);
  assert.equal(y, 977);
});
await test("Native exports reject empty plans and configured-field violations", () => {
  for (const format of ["dst", "pes", "jef", "exp"]) {
    assert.throws(() =>
      exportNative(
        { ...project, objects: [] },
        generatePlan({ ...project, objects: [] }),
        format,
      ),
    );
    assert.throws(
      () =>
        exportNative(
          {
            ...project,
            machine: {
              name: "Tiny",
              fieldWidth: 5,
              fieldHeight: 5,
              fieldCheck: true,
              maxStitches: 10000,
              maxColors: 10,
            },
          },
          plan,
          format,
        ),
      /field/,
    );
  }
});
await test("Sequin drops are explicit DST functions and unsupported formats reject them", () => {
  const o = makeObject({
    id: "s",
    name: "Drops",
    paths: [
      [
        { x: 40, y: 40 },
        { x: 44, y: 40 },
        { x: 45, y: 45 },
      ],
    ],
    closed: [false],
    type: "manual",
    underlay: false,
    tieIn: false,
    tieOut: false,
    sequinMode: true,
  });
  const p = {
      ...project,
      objects: [o],
      machine: {
        name: "Sequin bench",
        fieldWidth: 100,
        fieldHeight: 100,
        fieldCheck: true,
        maxStitches: 10000,
        maxColors: 50,
        specialty: "tajima-single-sequin",
      },
    },
    pl = generatePlan(p);
  for (const f of ["pes", "jef", "exp"])
    assert.throws(() => exportNative(p, pl, f), /Sequin/);
  const file = join(out, "sequin.dst");
  writeFileSync(file, exportNative(p, pl, "dst"));
  const r = spawnSync("python", ["tests/decode-machine.py", file], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout).stitches;
  assert.equal(s.filter((s) => (s[2] & 255) === 7).length, 3);
  assert.equal(s.filter((s) => (s[2] & 255) === 6).length, 6);
});
await test("Applique operator pauses survive each native format", () => {
  const p = {
      ...project,
      objects: project.objects.map((o, i) => ({ ...o, pauseAfter: i === 0 })),
    },
    pl = generatePlan(p);
  for (const f of ["dst", "pes", "jef", "exp"]) {
    const file = join(out, "pause." + f);
    writeFileSync(file, exportNative(p, pl, f));
    const r = spawnSync("python", ["tests/decode-machine.py", file], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    const s = JSON.parse(r.stdout).stitches;
    assert.equal(s.filter((s) => [3, 5].includes(s[2] & 255)).length, 2);
  }
});
await test("JEF explicitly rejects unsupported fields instead of inventing a hoop", () => {
  const p = { ...project, startPoint: { x: 1000, y: 1000 } };
  assert.throws(() => exportNative(p, generatePlan(p), "jef"), /JEF v1/);
});
await test("Reshape edits, curve flags, entry and exit survive project validation and transforms", () => {
  const o = {
      ...project.objects[0],
      entryPoint: { x: 23, y: 18 },
      exitPoint: { x: 44, y: 33 },
    },
    p = {
      ...project,
      objects: [
        editNodes(o, [{ path: 0, index: 1 }], (p) => ({ ...p, curve: true })),
      ],
    };
  const saved = validateProject(JSON.parse(JSON.stringify(p)));
  assert.ok(saved.objects[0].paths[0][1].curve);
  assert.ok(curvePaths(saved.objects[0])[0].length > 4);
  const moved = transformObject(saved.objects[0], (p) => ({
    x: p.x + 10,
    y: p.y + 10,
  }));
  assert.equal(moved.entryPoint.x, 33);
  assert.ok(moved.paths[0][1].curve);
  assert.notEqual(designFingerprint(p), designFingerprint(project));
  assert.notDeepEqual(generatePlan(p).stitches, plan.stitches);
});
await test("Satin insertion/deletion preserve paired rails and reject degenerate contours", () => {
  const o = makeObject({
    id: "rails",
    name: "Rails",
    type: "satin-column",
    paths: [
      [
        { x: 0, y: 0 },
        { x: 0, y: 20 },
      ],
      [
        { x: 4, y: 0 },
        { x: 5, y: 20 },
      ],
    ],
    closed: [false, false],
  });
  const inserted = insertNode(o, 0, 0, { x: 1, y: 10, curve: true });
  assert.equal(inserted.paths[0].length, 3);
  assert.equal(inserted.paths[1].length, 3);
  const removed = removeNodes(inserted, [{ path: 0, index: 1 }]);
  assert.equal(removed.paths[1].length, 2);
  assert.throws(() => removeNodes(removed, [{ path: 0, index: 0 }]), /Keep/);
});
await test("Measured thread metadata round-trips without accepting incomplete calibration claims", () => {
  const t = {
    brand: "Bench",
    line: "Poly",
    code: "1",
    name: "Measured",
    color: "#123456",
    measuredLab: [42, 2, -3],
    source: "Internal measurement",
    illuminant: "D65",
    observer: "2",
    measuredAt: "2026-09-07",
    instrument: "Spectrophotometer",
    lot: "A",
  };
  assert.deepEqual(importThreadLibrary(exportThreadLibrary([t]))[0], t);
  assert.throws(() => validateThread({ ...t, instrument: "" }), /Measured/);
});
await test("Export manifest hash identifies the exact binary bytes", async () => {
  const zip = await exportMachineBundle(project, plan, "exp");
  const txt = new TextDecoder().decode(zip);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", exportNative(project, plan, "exp")),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  assert.ok(txt.includes(hash));
});
console.log(`${passed} production checks passed.`);
