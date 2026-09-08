import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-workspace-"));
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
    "lib/embroidery/raster.ts",
    "lib/embroidery/project.ts",
    "lib/embroidery/units.ts",
    "lib/embroidery/viewport.ts",
    "lib/embroidery/design-tools.ts",
    "lib/embroidery/lettering.ts",
    "lib/embroidery/engine.ts",
    "lib/embroidery/native-export.ts",
  ],
  { encoding: "utf8" },
);
assert.equal(c.status, 0, c.stdout + c.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const req = createRequire(import.meta.url),
  get = (n) => req(join(out, n + ".js"));
const { parseMeasurement, measurementText } = get("units"),
  { tracePixels } = get("raster"),
  { validateProject, resizeProject } = get("project"),
  { makeObject } = get("types"),
  { separateElements, designFingerprint } = get("operations"),
  { repeatObjects } = get("design-tools"),
  { createLettering } = get("lettering"),
  { axisStep, axisValues } = get("viewport"),
  { generatePlan } = get("engine"),
  { exportNative } = get("native-export"),
  { machinePreflight } = get("machine-settings");
let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log("PASS", name);
};
const base = (objects) => ({
  version: 1,
  name: "Large workspace",
  width: 40,
  height: 40,
  hoopWidth: 200,
  hoopHeight: 200,
  workspaceMode: "freeform",
  fabric: "linen",
  source: "manual",
  notes: [],
  objects,
});
const rectangle = (x, y, w, h = w) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
test("Measurement entry accepts mm, inches, decimals and fractions without changing physical scale", () => {
  for (const [input, unit, expected] of [
    ["18in", "mm", 457.2],
    ["3/4in", "mm", 19.05],
    ["1 1/2in", "mm", 38.1],
    ['¾"', "mm", 19.05],
    ["-3/4in", "mm", -19.05],
    ["25.4mm", "in", 25.4],
    ["1", "in", 25.4],
    ["15000mm", "in", 15000],
    ["2.5cm", "in", 25],
  ])
    assert.ok(Math.abs(parseMeasurement(input, unit) - expected) < 1e-8, input);
  for (const input of [
    "Infinity",
    "1/0in",
    "NaN",
    "3 feet",
    "2+2",
    "1e309mm",
    "",
  ])
    assert.ok(Number.isNaN(parseMeasurement(input)), input);
  assert.equal(measurementText(457.2, "in"), "18");
});
test("Portrait tracing retains proportional height beyond the old 1200 mm maximum", () => {
  const pixels = new Uint8ClampedArray(12 * 24 * 4).fill(255);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 30;
    pixels[i + 1] = 100;
    pixels[i + 2] = 80;
  }
  for (const widthMM of [1200, 1500, 15000, 100000]) {
    const p = tracePixels(
      pixels,
      12,
      24,
      { colors: 2, resolution: 256, minArea: 0, removeWhite: false, widthMM },
      "portrait.png",
    );
    assert.equal(p.width, widthMM);
    assert.equal(p.height, widthMM * 2);
    assert.equal(validateProject(p).width, widthMM);
  }
});
test("Three thousand bitmap regions survive tracing, element separation and project reopening", () => {
  const w = 180,
    h = 150,
    pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 1; y < h; y += 3)
    for (let x = 1; x < w; x += 3) {
      const i = (y * w + x) * 4;
      pixels.set([24, 100, 75, 255], i);
    }
  const p = tracePixels(
    pixels,
    w,
    h,
    {
      colors: 2,
      resolution: 256,
      minArea: 0,
      removeWhite: true,
      widthMM: 1800,
      preservePixels: true,
      smoothCurves: false,
      simplifyMM: 0,
    },
    "details.png",
  );
  assert.equal(p.objects[0].paths.length, 3000);
  const objects = p.objects.flatMap(separateElements);
  assert.equal(objects.length, 3000);
  const restored = validateProject(
    JSON.parse(JSON.stringify({ ...p, objects, units: "in" })),
  );
  assert.equal(restored.objects.length, 3000);
  assert.equal(restored.units, "in");
  assert.ok(restored.objects.every((o) => o.paths.length === 1));
});
test("Large resizing retains coordinates, entry points and units; non-finite input is rejected", () => {
  const o = makeObject({
    id: "ring",
    paths: [rectangle(1, 1, 30), rectangle(5, 5, 10)],
    closed: [true, true],
    entryPoint: { x: -1, y: 2 },
  });
  const p = {
    ...base([o]),
    units: "in",
    autoStart: "custom",
    startPoint: { x: 2, y: 3 },
  };
  const large = validateProject(resizeProject(p, 20000, 40000));
  assert.equal(large.objects[0].paths[0][1].x, 15500);
  assert.equal(large.objects[0].entryPoint.x, -500);
  assert.equal(large.startPoint.y, 3000);
  assert.equal(large.units, "in");
  assert.throws(() => resizeProject(p, Infinity, 40000));
  assert.throws(() => validateProject({ ...large, width: NaN }));
  assert.throws(() =>
    validateProject({
      ...large,
      objects: [
        {
          ...large.objects[0],
          paths: [[{ x: Infinity, y: 1 }]],
          closed: [false],
        },
      ],
    }),
  );
});
test("Repeats beyond 400 objects and lettering above 60 mm use a geometry budget", () => {
  const object = makeObject({
    id: "repeat",
    paths: [rectangle(0, 0, 2)],
    closed: [true],
  });
  const repeated = repeatObjects(
    [object],
    {
      layout: "grid",
      rows: 30,
      columns: 30,
      count: 1,
      gap: 500,
      radius: 1000,
      rotate: false,
      mirror: false,
    },
    { x: 0, y: 0 },
    "repeat",
  );
  assert.equal(repeated.length, 900);
  assert.equal(
    validateProject({ ...base(repeated), width: 15000, height: 15000 }).objects
      .length,
    900,
  );
  assert.equal(
    createLettering("LARGE", 1500, { x: 0, y: 0 }, "#123456", "letters").length,
    5,
  );
  assert.throws(
    () =>
      repeatObjects(
        [object],
        {
          layout: "grid",
          rows: 1e9,
          columns: 1e9,
          count: 1,
          gap: 0,
          radius: 1,
          rotate: false,
          mirror: false,
        },
        { x: 0, y: 0 },
        "too-many",
      ),
    /budget/,
  );
});
test("Far-away ruler marks remain readable and viewport work stays bounded", () => {
  for (const scale of [0.0001, 0.01, 0.1, 1, 10])
    for (const factor of [1, 25.4]) {
      const step =
        axisStep(scale * factor, 80, factor === 1 ? 1 : 0.125) * factor;
      const min = 120000,
        max = min + 1500 / scale,
        marks = axisValues(min, max, step);
      assert.ok(marks.length > 0 && marks.length <= 20);
      assert.ok(marks.every((v) => v >= min && v <= max));
      assert.ok(step * scale >= 79.999);
    }
  assert.equal(axisValues(0, 1e9, 0.1).length, 4096);
});
test("Units leave native stitch bytes unchanged and large workspaces still honour selected machine fields", () => {
  const o = makeObject({
    id: "run",
    type: "run",
    paths: [
      [
        { x: 5, y: 5 },
        { x: 20, y: 20 },
      ],
    ],
    closed: [false],
    underlay: false,
  });
  const p = base([o]),
    q = { ...p, units: "in" };
  assert.equal(designFingerprint(p), designFingerprint(q));
  for (const format of ["dst", "pes", "jef", "exp"])
    assert.deepEqual(
      exportNative(p, generatePlan(p), format),
      exportNative(q, generatePlan(q), format),
    );
  const large = {
    ...p,
    width: 20000,
    height: 30000,
    machine: {
      name: "Limited field",
      fieldWidth: 200,
      fieldHeight: 200,
      fieldCheck: true,
      maxStitches: 1000000,
      maxColors: 100,
    },
  };
  assert.ok(
    machinePreflight(large, generatePlan(large)).some(
      (i) => i.level === "error" && i.message.includes("field"),
    ),
  );
});
console.log(`${passed} workspace checks passed.`);
