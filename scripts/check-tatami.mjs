import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";

const out = mkdtempSync(join(tmpdir(), "threadform-tatami-"));
const compile = spawnSync(
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
    "lib/embroidery/engine.ts",
    "lib/embroidery/native-export.ts",
  ],
  { encoding: "utf8" },
);
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const req = createRequire(import.meta.url),
  get = (name) => req(join(out, name + ".js"));
const { generatePlan } = get("engine"),
  { makeObject } = get("types"),
  { distance, segmentInside } = get("geometry"),
  { exportNative } = get("native-export"),
  { machineStream } = get("machine-stream"),
  { zipFiles } = get("export"),
  { resizeProject, validateProject } = get("project");
const rect = (x, y, w, h = w) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const object = (name, paths, extra = {}) =>
  makeObject({
    id: name,
    name,
    paths,
    angle: 0,
    spacing: 0.4,
    length: 3,
    tatamiMinStitch: 0.5,
    pull: 0,
    underlay: false,
    tieIn: false,
    tieOut: false,
    ...extra,
  });
const project = (objects) => ({
  version: 1,
  name: "Tatami comparison",
  width: 100,
  height: 80,
  hoopWidth: 110,
  hoopHeight: 110,
  source: "manual",
  fabric: "cotton",
  notes: [],
  objects,
});
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS", name);
}
function noEscapes(o, plan) {
  for (let i = 1; i < plan.stitches.length; i++) {
    const a = plan.stitches[i - 1],
      b = plan.stitches[i];
    if (b.command !== "stitch") continue;
    assert.ok(
      segmentInside(a, b, o.paths, o.fillRule, 1e-6),
      "A sewn segment crosses empty fabric: " +
        JSON.stringify({ angle: o.angle, a, b }),
    );
    assert.ok(distance(a, b) <= o.length + 1e-6, "Overlength fill stitch");
  }
}
function rowCoverage(plan, y, lo, hi) {
  const intervals = [];
  for (let i = 1; i < plan.stitches.length; i++) {
    const a = plan.stitches[i - 1],
      b = plan.stitches[i];
    if (
      b.command === "stitch" &&
      Math.abs(a.y - y) < 1e-6 &&
      Math.abs(b.y - y) < 1e-6
    )
      intervals.push([Math.min(a.x, b.x), Math.max(a.x, b.x)]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let cursor = lo;
  for (const [a, b] of intervals) {
    if (b < lo || a > hi) continue;
    assert.ok(a <= cursor + 1e-6, "Gap in filled row");
    cursor = Math.max(cursor, b);
  }
  assert.ok(cursor >= hi - 1e-6, "Missing fill coverage");
}
test("Solid tatami covers every 0.4 mm row with a continuous serpentine block", () => {
  const o = object("solid", [rect(0, 0, 30)]),
    plan = generatePlan(project([o]));
  assert.equal(plan.stitches.filter((s) => s.command === "jump").length, 1);
  assert.equal(plan.trimCount, 1);
  noEscapes(o, plan);
  for (let row = 0; row < 75; row++) rowCoverage(plan, 0.2 + row * 0.4, 0, 30);
});
test("Ring fill avoids per-row trims while preserving both sides of the hole", () => {
  const o = object("ring", [rect(0, 0, 30), rect(8, 8, 14)]),
    plan = generatePlan(project([o]));
  assert.ok(plan.trimCount <= 4, "Regressed to fragmented scanline runs");
  noEscapes(o, plan);
  for (let row = 0; row < 75; row++) {
    const y = 0.2 + row * 0.4;
    if (y > 8 && y < 22) {
      rowCoverage(plan, y, 0, 8);
      rowCoverage(plan, y, 22, 30);
    } else rowCoverage(plan, y, 0, 30);
  }
  console.log(`Ring: ${plan.trimCount} trims (previous engine: 36).`);
});
test("Disconnected islands sew once each instead of jumping across every row", () => {
  const o = object("islands", [rect(0, 0, 30), rect(40, 0, 30)]),
    plan = generatePlan(project([o]));
  assert.equal(plan.trimCount, 2);
  noEscapes(o, plan);
  console.log(`Two islands: ${plan.trimCount} trims (previous engine: 76).`);
});
test("Needle offsets use the same lattice on forward and reverse rows", () => {
  const o = object("lattice", [rect(0, 0, 30)], { tatamiOffset: 0.25 }),
    plan = generatePlan(project([o]));
  for (let i = 1; i < plan.stitches.length; i++) {
    const a = plan.stitches[i - 1],
      b = plan.stitches[i];
    if (b.command !== "stitch" || Math.abs(a.y - b.y) > 1e-6) continue;
    assert.ok(
      distance(a, b) >= 0.5 - 1e-6,
      "Unnecessary short interior/edge row stitch",
    );
    if (b.x <= 4 || b.x >= 26) continue;
    const row = Math.round((b.y - 0.2) / 0.4),
      phase = ((row * 0.25) % 1) * 3;
    assert.ok(
      Math.abs((b.x - phase) / 3 - Math.round((b.x - phase) / 3)) < 1e-6,
      "Offset mirrors or drifts on reverse rows",
    );
  }
});
test("Concavities, angled holes and underlay retain empty regions and bounded stitches", () => {
  const c = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 6 },
    { x: 7, y: 6 },
    { x: 7, y: 24 },
    { x: 30, y: 24 },
    { x: 30, y: 30 },
    { x: 0, y: 30 },
  ];
  for (const paths of [[c], [rect(0, 0, 30), rect(8, 8, 14)]])
    for (const angle of [0, 17, 63, 129]) {
      const o = object("shape", paths, {
        angle,
        underlay: true,
        spacingEnd: 0.7,
      });
      noEscapes(o, generatePlan(project([o])));
    }
});
test("Scaling curved outlines preserves nodes and scales entry, exit and start/end positions", () => {
  const o = object(
    "curves",
    [
      [
        { x: 5, y: 5 },
        { x: 20, y: 5, curve: true },
        { x: 20, y: 25 },
        { x: 5, y: 25 },
      ],
    ],
    { entryPoint: { x: 5, y: 5 }, exitPoint: { x: 20, y: 25 } },
  );
  const p = {
      ...project([o]),
      startPoint: { x: 10, y: 10 },
      endPoint: { x: 30, y: 30 },
    },
    scaled = validateProject(resizeProject(p, 200, 160));
  assert.ok(scaled.objects[0].paths[0][1].curve);
  assert.equal(scaled.objects[0].entryPoint.x, 10);
  assert.equal(scaled.objects[0].exitPoint.y, 50);
  assert.equal(scaled.startPoint.x, 20);
  assert.equal(scaled.endPoint.y, 60);
  assert.equal(scaled.objects[0].tatamiMinStitch, 0.5);
});
test("Connector settings separate regions without fragmenting internal fill rows", () => {
  const o = object("connectors", [rect(0, 0, 30)], { connector: "trim" }),
    p = project([o]);
  assert.equal(generatePlan(p).trimCount, 1);
  const islands = {
    ...o,
    paths: [rect(0, 0, 30), rect(31, 0, 30)],
    closed: [true, true],
  };
  assert.equal(generatePlan({ ...p, objects: [islands] }).trimCount, 2);
  const jumped = generatePlan({
    ...p,
    objects: [{ ...islands, connector: "jump" }],
  });
  assert.equal(jumped.jumpCount, 2);
  assert.equal(jumped.trimCount, 1);
});

test("Extreme tatami and program-split rows reject unbounded allocation before generating points", () => {
  const { tatamiNeedles } = get("tatami"),
    { splitPositions } = get("effects");
  assert.throws(
    () => tatamiNeedles(0, 1e12, 0, 0, 3, 0.25, 0.5, false),
    /budget/,
  );
  assert.throws(
    () => tatamiNeedles(1e20, 1e20 + 1e6, 1e20, 0, 3, 0.25, 0.5, false),
    /precision/,
  );
  assert.throws(
    () => splitPositions(object("split", [rect(0, 0, 20)]), 0, 1e12, 0.2, 0),
    /budget/,
  );
});

test("Contour and island coils reject incomplete interiors instead of silently stopping at 3000 passes", () => {
  const { specialtyPaths } = get("specialty"),
    { stitchPrograms } = get("stitch-programs");
  for (const type of ["contour", "island-coil"]) {
    const o = object(type, [rect(0, 0, 1300)], { type, spacing: 0.2 });
    assert.throws(() => {
      for (const path of type === "contour"
        ? stitchPrograms(o)
        : specialtyPaths(o, o.paths)) {
        assert.ok(path, "Every generated contour must be defined.");
      }
    }, /budget/);
  }
});
const coupon = project([
  object("Solid square", [rect(5, 5, 25)], {
    color: "#27423d",
    tieIn: true,
    tieOut: true,
  }),
  object("Ring with cutout", [rect(40, 5, 30), rect(48, 13, 14)], {
    color: "#9d5c6b",
    tieIn: true,
    tieOut: true,
  }),
  object("Separate islands", [rect(5, 45, 10), rect(25, 45, 10)], {
    color: "#836633",
    tieIn: true,
    tieOut: true,
  }),
]);
coupon.notes = [
  "Comparison coupon: no underlay or pull compensation, 0.4 mm adjacent row spacing, 3 mm maximum stitch. Physical qualification pending.",
];
const plan = generatePlan(coupon),
  files = [];
test("All four independently decoded machine files preserve the complete tatami needle sequence", () => {
  for (const format of ["dst", "pes", "jef", "exp"]) {
    const data = exportNative(coupon, plan, format),
      file = join(out, "tatami." + format);
    writeFileSync(file, data);
    const result = spawnSync("python", ["tests/decode-machine.py", file], {
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(result.status, 0, result.stderr);
    const decoded = JSON.parse(result.stdout),
      needles = decoded.stitches
        .filter((s) => (s[2] & 255) === 0)
        .map((s) => s.slice(0, 2));
    assert.deepEqual(
      needles,
      machineStream(coupon, plan, format)
        .filter((s) => s.command === "stitch")
        .map((s) => [s.x, s.y]),
    );
    assert.equal(decoded.stitches.filter((s) => (s[2] & 255) === 5).length, 2);
    files.push({ name: "tatami-comparison." + format, data });
  }
});
if (process.argv.includes("--write-fixture")) {
  const directory = resolve("docs/qualification");
  mkdirSync(directory, { recursive: true });
  const enc = new TextEncoder();
  files.push({
    name: "tatami-comparison.threadform.json",
    data: enc.encode(JSON.stringify(coupon, null, 2)),
  });
  files.push({
    name: "READ-ME.txt",
    data: enc.encode(
      "THREADFORM TATAMI COMPARISON — PHYSICAL QUALIFICATION PENDING\n\nThree objects: solid square, ring with a hole, and two separate islands. Adjacent row spacing 0.4 mm; maximum stitch length 3 mm. Underlay and pull are off to isolate the top fill. All four files are independently decoded by the regression check, but have not been opened in Wilcom or sewn on a machine.\n\nIn Wilcom, first open the machine file with Objects/Outlines and Automatic Connectors disabled, and DST trims set to 3 jumps. Check the entire stitched fill at the saved size. Then open another copy with recognition enabled to compare reconstructed objects. Keep the Threadform JSON for editable source shapes and regeneration. Report the exact format, Wilcom version, Open options and a screenshot if a fill still appears as separate lines.\n\nThis coupon is for controlled evaluation; complete field/controller/material checks and a physical sew-out before production.\n",
    ),
  });
  writeFileSync(
    join(directory, "tatami-wilcom-comparison.zip"),
    zipFiles(files),
  );
  console.log(
    "Saved comparison package to docs/qualification/tatami-wilcom-comparison.zip",
  );
}
console.log(`${checks} tatami checks passed.`);
