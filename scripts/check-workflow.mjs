import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-workflow-"));
const compiled = spawnSync(
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
    ...[
      "columns",
      "reshape",
      "project",
      "sewing-input",
      "engine",
      "native-export",
      "raster",
      "stitch-method",
    ].map((n) => `lib/embroidery/${n}.ts`),
  ],
  { encoding: "utf8" },
);
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const require = createRequire(import.meta.url),
  get = (n) => require(join(out, n + ".js"));
const { columnA, columnB, columnC, continueObject, widthFromReferences } =
    get("columns"),
  { makeObject } = get("types"),
  { curvePaths, editNodes, removeNodes, bezierNodes } = get("reshape"),
  { digitizeCurve, reverseCurve } = get("digitizing"),
  { validateProject, resizeProject } = get("project"),
  { sewingInputKey } = get("sewing-input"),
  { generatePlan } = get("engine"),
  { exportNative } = get("native-export"),
  { exportSVG } = get("export"),
  { designFingerprint } = get("operations"),
  { tracePixels } = get("raster"),
  { inside } = get("geometry"),
  { changeStitchMethod } = get("stitch-method");
const rectangle = [
  { x: 5, y: 5 },
  { x: 25, y: 5 },
  { x: 25, y: 25 },
  { x: 5, y: 25 },
];
const object = (extra) =>
  makeObject({
    id: "one",
    name: "Study",
    paths: [rectangle],
    underlay: false,
    pull: 0,
    tieIn: false,
    tieOut: false,
    ...extra,
  });
const project = (objects) => ({
  version: 1,
  name: "Workflow QA",
  width: 40,
  height: 40,
  hoopWidth: 100,
  hoopHeight: 100,
  workspaceMode: "freeform",
  fabric: "linen",
  source: "manual",
  notes: [],
  objects,
});
let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log("PASS", name);
};
test("View hiding preserves all four native outputs and production fingerprint", () => {
  const p = project([object({})]),
    hidden = {
      ...p,
      objects: p.objects.map((o) => ({ ...o, visible: false })),
    };
  assert.equal(sewingInputKey(p), sewingInputKey(hidden));
  assert.equal(designFingerprint(p), designFingerprint(hidden));
  const a = generatePlan(p),
    b = generatePlan(hidden);
  assert.deepEqual(a.stitches, b.stitches);
  for (const format of ["dst", "pes", "jef", "exp"])
    assert.deepEqual(
      exportNative(p, a, format),
      exportNative(hidden, b, format),
    );
  assert.equal(exportSVG(p), exportSVG(hidden));
  assert.equal(
    generatePlan({
      ...p,
      objects: p.objects.map((o) => ({ ...o, sewEnabled: false })),
    }).stitchCount,
    0,
  );
});
test("Metadata and unit changes skip regeneration; geometry and output choices invalidate it", () => {
  const p = project([object({})]),
    key = sewingInputKey(p);
  for (const changes of [
    { name: "Renamed" },
    { units: "in" },
    { fabric: "silk" },
    { notes: ["Approval"] },
    { editorState: { zoom: 4 } },
    { artwork: { id: "source", name: "art" } },
  ])
    assert.equal(sewingInputKey({ ...p, ...changes }), key);
  assert.notEqual(
    sewingInputKey({ ...p, objects: [{ ...p.objects[0], spacing: 0.5 }] }),
    key,
  );
  assert.notEqual(
    sewingInputKey({
      ...p,
      objects: [{ ...p.objects[0], artworkRole: "fabric" }],
    }),
    key,
  );
});
test("Print, fabric and reference regions remain editable without generating stitches", () => {
  for (const artworkRole of ["print", "fabric", "reference"]) {
    const p = validateProject(project([object({ artworkRole })]));
    assert.equal(p.objects.length, 1);
    assert.equal(generatePlan(p).stitchCount, 0);
  }
  const legacy = project([object({ visible: false })]);
  delete legacy.objects[0].sewEnabled;
  assert.equal(validateProject(legacy).objects[0].sewEnabled, false);
});
test("Column A retains independently curved paired edge nodes through save and resize", () => {
  const nodes = [
    { x: 5, y: 5 },
    { x: 10, y: 5 },
    { x: 8, y: 15, curve: true },
    { x: 13, y: 15 },
    { x: 5, y: 25 },
    { x: 10, y: 25 },
  ];
  const p = validateProject(project([object(columnA(nodes))]));
  assert.deepEqual(
    p.objects[0].paths.map((p) => p.length),
    [3, 3],
  );
  const rails = curvePaths(p.objects[0]);
  assert.equal(rails[0].length, rails[1].length);
  assert.ok(rails[0].length > 3);
  assert.ok(generatePlan(p).stitchCount > 20);
  assert.equal(resizeProject(p, 80, 80).objects[0].paths[0][1].curve, true);
});
test("Column B stores unequal compact edges and follows the last entered edge", () => {
  const first = [
      { x: 5, y: 5 },
      { x: 7, y: 15, curve: true },
      { x: 5, y: 25 },
    ],
    second = [
      { x: 12, y: 25 },
      { x: 12, y: 5 },
    ];
  const p = validateProject(project([object(columnB(first, second))]));
  assert.deepEqual(
    p.objects[0].paths.map((p) => p.length),
    [3, 2],
  );
  const rails = curvePaths(p.objects[0]);
  assert.equal(rails[0].length, rails[1].length);
  assert.deepEqual(rails[1].at(-1), second.at(-1));
  assert.ok(generatePlan(p).stitchCount > 20);
  assert.deepEqual(
    removeNodes(p.objects[0], [{ path: 0, index: 1 }]).paths.map(
      (p) => p.length,
    ),
    [2, 2],
  );
});
test("Enter and Space produce different final sides on Columns A and B", () => {
  for (const column of [
    (keep) =>
      columnA(
        [
          { x: 5, y: 5 },
          { x: 10, y: 5 },
          { x: 5, y: 20 },
          { x: 10, y: 20 },
        ],
        keep,
      ),
    (keep) =>
      columnB(
        [
          { x: 5, y: 5 },
          { x: 5, y: 20 },
        ],
        [
          { x: 10, y: 5 },
          { x: 10, y: 20 },
        ],
        keep,
      ),
  ]) {
    const last = (keep) =>
      generatePlan(project([object(column(keep))]))
        .stitches.filter((s) => s.command === "stitch")
        .at(-1);
    assert.ok(Math.abs(last(true).x - 10) < 0.01);
    assert.ok(Math.abs(last(false).x - 5) < 0.01);
  }
});
test("Column C width references support centered and offset widths", () => {
  const line = [
    { x: 5, y: 5 },
    { x: 5, y: 25 },
  ];
  assert.deepEqual(widthFromReferences(line, []), { width: 3, offset: 0 });
  const refs = [
    { x: 5, y: 15 },
    { x: 9, y: 15 },
  ];
  assert.deepEqual(widthFromReferences(line, refs), { width: 4, offset: 0 });
  const offset = widthFromReferences(
    line,
    refs.map((p) => ({ ...p, curve: true })),
  );
  assert.equal(offset.width, 4);
  assert.equal(offset.offset, -2);
  const p = validateProject(
    project([
      object({
        ...columnC(line, offset.width, offset.offset),
        pull: 0,
        underlay: false,
      }),
    ]),
  );
  const plan = generatePlan(p);
  assert.ok(plan.stitchCount > 20);
  assert.ok(Math.abs(plan.bounds.minX - 5) < 0.01);
  assert.ok(Math.abs(plan.bounds.maxX - 9) < 0.01);
});
test("Bezier controls preserve geometry on creation, move with nodes and scale with artwork", () => {
  const o = object({
    type: "run",
    closed: [false],
    paths: [
      [
        { x: 5, y: 5 },
        { x: 10, y: 15, curve: true },
        { x: 20, y: 10 },
      ],
    ],
  });
  const before = digitizeCurve(o.paths[0]),
    b = bezierNodes(o, [{ path: 0, index: 1 }]),
    after = digitizeCurve(b.paths[0]);
  assert.deepEqual(after, before);
  const moved = editNodes(b, [{ path: 0, index: 1 }], (p) => ({
    ...p,
    x: p.x + 4,
  }));
  assert.equal(moved.paths[0][1].handleIn.x, b.paths[0][1].handleIn.x + 4);
  const scaled = resizeProject(project([b]), 80, 80).objects[0];
  assert.equal(scaled.paths[0][1].handleOut.x, b.paths[0][1].handleOut.x * 2);
  const reversed = digitizeCurve(reverseCurve(b.paths[0]));
  assert.ok(
    reversed.every(
      (p, i) =>
        Math.hypot(p.x - before.at(-1 - i).x, p.y - before.at(-1 - i).y) < 1e-8,
    ),
  );
  assert.deepEqual(validateProject(project([b])).objects[0].paths, b.paths);
});
test("Changing a column stitch method clears column-only semantics", () => {
  const changed = changeStitchMethod(
    object(
      columnB(
        [
          { x: 5, y: 5 },
          { x: 5, y: 25 },
        ],
        [
          { x: 10, y: 5 },
          { x: 10, y: 25 },
        ],
        false,
      ),
    ),
    "tatami",
  );
  assert.equal(changed.columnKind, undefined);
  assert.equal(changed.keepLastStitch, undefined);
  assert.ok(generatePlan(project([changed])).stitchCount > 0);
});
test("Continuing from either end retains identity, thread and stitch settings", () => {
  const line = [
    { x: 5, y: 5 },
    { x: 5, y: 25 },
  ];
  const original = object({
    ...columnC(line, 4, 2),
    name: "Client border",
    underlay: false,
    pull: 0.4,
    spacing: 0.55,
    lineWidth: 4,
    columnOffset: 2,
    entryPoint: line[0],
    exitPoint: line[1],
  });
  const extended = continueObject(
    original,
    columnC([...line, { x: 5, y: 30 }], 4, 2),
  );
  assert.equal(extended.id, original.id);
  assert.equal(extended.name, original.name);
  assert.equal(extended.underlay, false);
  assert.equal(extended.pull, 0.4);
  assert.equal(extended.spacing, 0.55);
  assert.deepEqual(extended.entryPoint, line[0]);
  assert.equal(extended.exitPoint, undefined);
  const fromStart = continueObject(
    original,
    columnC([...reverseCurve(line), { x: 5, y: 1 }], 4, 2),
    true,
  );
  assert.deepEqual(fromStart.paths[0], [{ x: 5, y: 1 }, ...line]);
  assert.equal(fromStart.entryPoint, undefined);
  assert.deepEqual(fromStart.exitPoint, line[1]);
  assert.equal(fromStart.columnOffset, 2);
});
test("Original artwork settings and editor resume state survive project serialization", () => {
  const options = {
    colors: 8,
    resolution: 768,
    minArea: 0,
    removeWhite: true,
    backgroundMode: "border",
    widthMM: 2000,
    preservePixels: true,
    preserveHoles: true,
    alphaThreshold: 128,
    simplifyMM: 0.02,
    mode: "regions",
    palette: ["#123456"],
  };
  const p = {
    ...project([object({})]),
    artwork: {
      id: "02020202-0202-4202-8202-020202020202",
      name: "flower.png",
      options,
    },
    editorState: {
      workspace: "convert",
      view: "artwork",
      selected: ["one", "missing"],
      zoom: 2.5,
      grid: true,
      snap: false,
      jumps: true,
      progress: 25,
    },
  };
  const restored = validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(restored.artwork, p.artwork);
  assert.deepEqual(restored.editorState, {
    ...p.editorState,
    selected: ["one"],
  });
  assert.throws(
    () =>
      validateProject({
        ...p,
        artwork: { ...p.artwork, options: { ...options, alphaThreshold: 0 } },
      }),
    /saved conversion/,
  );
  assert.throws(
    () =>
      validateProject({
        ...p,
        artwork: { ...p.artwork, options: { ...options, widthMM: Infinity } },
      }),
    /saved conversion/,
  );
});
test("Border removal keeps an enclosed white detail while removing exterior white", () => {
  const w = 30,
    h = 30,
    pixels = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 5; y < 25; y++)
    for (let x = 5; x < 25; x++)
      if (!(x >= 12 && x < 18 && y >= 12 && y < 18)) {
        const i = (y * w + x) * 4;
        pixels[i] = 20;
        pixels[i + 1] = 80;
        pixels[i + 2] = 60;
      }
  const options = {
    colors: 2,
    resolution: 256,
    minArea: 0,
    removeWhite: true,
    widthMM: 30,
    preserveHoles: true,
    preservePixels: true,
    simplifyMM: 0,
  };
  const p = tracePixels(pixels, w, h, options, "flower.png");
  const white = p.objects.find((o) => o.color.toLowerCase() === "#ffffff");
  assert.ok(white);
  assert.ok(inside({ x: 15, y: 15 }, white.paths, white.fillRule));
  assert.ok(!inside({ x: 1, y: 1 }, white.paths, white.fillRule));
  const all = tracePixels(
    pixels,
    w,
    h,
    { ...options, backgroundMode: "all-white" },
    "flower.png",
  );
  assert.ok(!all.objects.some((o) => o.color.toLowerCase() === "#ffffff"));
});
rmSync(out, { recursive: true, force: true });
console.log(`${passed} workflow regression checks passed.`);
