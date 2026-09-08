import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-drawing-"));
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
    ...[
      "drawing",
      "artwork-layer",
      "project",
      "engine",
      "native-export",
      "sewing-input",
    ].map((n) => `lib/embroidery/${n}.ts`),
  ],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const require = createRequire(import.meta.url),
  get = (n) => require(join(out, n + ".js"));
const {
    undoDigitizingDraft,
    snapDrawingPoint,
    appendSketchSamples,
    sketchPath,
    columnDraftOutline,
  } = get("drawing"),
  {
    createArtworkLayer,
    validateArtworkLayer,
    artworkDimensions,
    artworkCorners,
    positionArtwork,
    attachSourceLayer,
  } = get("artwork-layer"),
  { columnA, columnB, columnC } = get("columns"),
  { outlinePaths, designFingerprint } = get("operations"),
  { validateProject, resizeProject } = get("project"),
  { makeObject } = get("types"),
  { generatePlan } = get("engine"),
  { exportNative } = get("native-export"),
  { sewingInputKey } = get("sewing-input");
const empty = { pen: [], firstRail: [], columnBase: [] },
  line = [
    { x: 5, y: 5 },
    { x: 5, y: 15, curve: true },
    { x: 5, y: 25 },
  ],
  id = "09090909-0909-4909-8909-090909090909";
const base = {
  version: 1,
  name: "Reference QA",
  width: 40,
  height: 40,
  hoopWidth: 100,
  hoopHeight: 100,
  workspaceMode: "freeform",
  fabric: "linen",
  source: "manual",
  notes: [],
  objects: [
    makeObject({
      id: "run",
      name: "Run",
      type: "run",
      paths: [line],
      closed: [false],
      underlay: false,
      pull: 0,
    }),
  ],
};
let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log("PASS", name);
};
test("Backspace restores Column B's first edge without discarding curve flags", () => {
  const entered = { ...empty, firstRail: line, pen: [{ x: 10, y: 25 }] };
  const one = undoDigitizingDraft(entered),
    two = undoDigitizingDraft(one),
    three = undoDigitizingDraft(two);
  assert.deepEqual(one.pen, []);
  assert.deepEqual(two.pen, line);
  assert.deepEqual(two.firstRail, []);
  assert.deepEqual(three.pen, line.slice(0, -1));
  assert.equal(entered.pen.length, 1);
  assert.equal(two.pen[1].curve, true);
});
test("Backspace crosses Column C's width phase before editing the baseline", () => {
  let draft = {
    ...empty,
    columnBase: line,
    pen: [
      { x: 5, y: 15 },
      { x: 9, y: 15, curve: true },
    ],
  };
  draft = undoDigitizingDraft(draft);
  assert.equal(draft.pen.length, 1);
  draft = undoDigitizingDraft(draft);
  assert.equal(draft.pen.length, 0);
  assert.deepEqual(draft.columnBase, line);
  draft = undoDigitizingDraft(draft);
  assert.deepEqual(draft.pen, line);
  assert.deepEqual(draft.columnBase, []);
  assert.equal(undoDigitizingDraft(empty), empty);
});
test("Alt bypasses grid snapping without changing the stored snap preference", () => {
  const p = { x: 1.38, y: -3.72 };
  assert.deepEqual(snapDrawingPoint(p, true, false), { x: 1, y: -4 });
  assert.deepEqual(snapDrawingPoint(p, true, true), p);
  assert.deepEqual(snapDrawingPoint(p, false, false), p);
});
test("Coalesced sketch samples use screen distance and always retain the released endpoint", () => {
  const samples = Array.from({ length: 11 }, (_, i) => ({ x: i / 100, y: 0 }));
  const close = appendSketchSamples([{ x: 0, y: 0 }], samples, 100),
    far = appendSketchSamples([{ x: 0, y: 0 }], samples, 1);
  assert.ok(close.length > far.length);
  const end = { x: 0.105, y: 0.025 };
  assert.deepEqual(sketchPath(close, end, 0, 100).at(-1), end);
  assert.ok(
    appendSketchSamples(
      [],
      Array.from({ length: 13000 }, (_, i) => ({ x: i, y: 0 })),
      1,
    ).length > 12000,
  );
});
test("Sketch smoothing removes small jitter while keeping corners and exact endpoints", () => {
  const points = Array.from({ length: 100 }, (_, i) => ({
    x: i / 10,
    y: Math.sin(i) * 0.01,
  }));
  points.push({ x: 10, y: 0 }, { x: 10, y: 10 });
  const end = { x: 20, y: 10 },
    path = sketchPath(points, end, 1, 2);
  assert.ok(path.length < points.length / 4);
  assert.deepEqual(path[0], points[0]);
  assert.deepEqual(path.at(-1), end);
  assert.ok(path.some((p) => p.x === 10 && p.y === 10));
  assert.deepEqual(sketchPath(points, end, 0, 2), [...points, end]);
});
test("Live column footprints match the committed A, B and C geometry", () => {
  const paired = line.flatMap((p) => [p, { ...p, x: p.x + 5, curve: false }]);
  for (const [tool, draft, partial] of [
    ["satin-column", { ...empty, pen: paired }, columnA(paired)],
    [
      "column-b",
      {
        ...empty,
        firstRail: line,
        pen: [
          { x: 11, y: 25 },
          { x: 11, y: 5 },
        ],
      },
      columnB(line, [
        { x: 11, y: 25 },
        { x: 11, y: 5 },
      ]),
    ],
    ["column-c", { ...empty, columnBase: line, pen: [] }, columnC(line, 3)],
    [
      "column-c",
      {
        ...empty,
        columnBase: line,
        pen: [
          { x: 5, y: 15, curve: true },
          { x: 9, y: 15, curve: true },
        ],
      },
      columnC(line, 4, -2),
    ],
  ])
    assert.deepEqual(
      columnDraftOutline(tool, draft, null, false),
      outlinePaths(
        makeObject({ id: "guide", name: "Guide", paths: [], ...partial }),
      ),
    );
  for (const offset of [-2, 2])
    assert.deepEqual(
      columnDraftOutline(
        "column-c",
        { ...empty, columnBase: line },
        null,
        false,
        4,
        offset,
      ),
      outlinePaths(
        makeObject({
          id: "offset-guide",
          name: "Offset",
          paths: [],
          ...columnC(line, 4, offset),
        }),
      ),
    );
});
test("Artwork metadata, dimming and lock settings survive project JSON round-trip", () => {
  const layer = positionArtwork(
    {
      ...createArtworkLayer(id, "reference.png", 1200, 1800),
      opacity: 0.47,
      locked: false,
    },
    { x: -30, y: 20, rotation: 35 },
  );
  const p = { ...base, artworkLayer: layer };
  assert.deepEqual(
    validateProject(JSON.parse(JSON.stringify(p))).artworkLayer,
    layer,
  );
  const source = attachSourceLayer(base, id, "original.png", true);
  assert.equal(source.artworkLayer.cloudReady, true);
  assert.equal(artworkDimensions(source.artworkLayer).width, base.width);
});
test("Nonuniform project resizing preserves every rotated artwork corner", () => {
  const layer = positionArtwork(
      createArtworkLayer(id, "reference.png", 25, 30),
      { rotation: 37, x: -5, y: 7 },
    ),
    p = { ...base, artworkLayer: layer };
  const resized = resizeProject(p, 80, 120),
    before = artworkCorners(layer),
    after = artworkCorners(resized.artworkLayer);
  before.forEach((point, i) => {
    assert.ok(Math.abs(after[i].x - point.x * 2) < 1e-8);
    assert.ok(Math.abs(after[i].y - point.y * 3) < 1e-8);
  });
  const edited = positionArtwork(resized.artworkLayer, {
    width: 100,
    rotation: -15,
  });
  assert.ok(Math.abs(artworkDimensions(edited).width - 100) < 1e-8);
  assert.ok(Math.abs(artworkDimensions(edited).rotation + 15) < 1e-8);
});
test("Reference display, dimensions and opacity never change machine output or qualification fingerprint", () => {
  const p = {
      ...base,
      artworkLayer: createArtworkLayer(id, "reference.png", 4000, 6000),
    },
    plan = generatePlan(p);
  const changed = {
    ...p,
    artworkLayer: positionArtwork(
      {
        ...p.artworkLayer,
        visible: false,
        dimmed: false,
        opacity: 0.9,
        locked: false,
      },
      { x: 500, y: -100, rotation: 32 },
    ),
  };
  assert.equal(sewingInputKey(p), sewingInputKey(changed));
  assert.equal(designFingerprint(p), designFingerprint(changed));
  assert.deepEqual(plan.stitches, generatePlan(changed).stitches);
  for (const format of ["dst", "pes", "jef", "exp"])
    assert.deepEqual(
      exportNative(p, plan, format),
      exportNative(changed, plan, format),
    );
});
test("Corrupt, singular and overflowing artwork transforms fail validation", () => {
  const layer = createArtworkLayer(id, "art.png", 10, 20);
  for (const change of [
    { assetId: "../../private" },
    { transform: [1, 0, 0, 0, 0, 0] },
    { opacity: 2 },
    { locked: "yes" },
    { transform: [NaN, 0, 0, 1, 0, 0] },
    { transform: [1e308, 0, 1e308, 1, 1e308, 0] },
  ])
    assert.throws(() => validateArtworkLayer({ ...layer, ...change }));
});
rmSync(out, { recursive: true, force: true });
console.log(`${passed} artwork and drawing regression checks passed.`);
