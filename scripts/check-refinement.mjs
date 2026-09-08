import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-refinement-"));
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
    ...[
      "auto-digitize",
      "shortcuts",
      "raster",
      "engine",
      "project",
      "stitch-method",
      "id",
    ].map((n) => `lib/embroidery/${n}.ts`),
  ],
  { encoding: "utf8" },
);
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const require = createRequire(import.meta.url),
  get = (n) => require(join(out, n + ".js"));
const { makeObject, STITCH_NAMES } = get("types"),
  { generatePlan } = get("engine"),
  { validateProject } = get("project"),
  { deltaE2000 } = get("color-difference"),
  { DEFAULT_AUTO, autoDigitizeProject, inferSatinRails } = get("auto-digitize"),
  { DEFAULT_OPTIMIZE, mapColors, sequenceProject } = get("optimization"),
  { SHORTCUTS, matchShortcut } = get("shortcuts"),
  { tracePixels } = get("raster"),
  { matchesPixelMask } = get("trace-refinement"),
  { segmentInside } = get("geometry"),
  { changeStitchMethod } = get("stitch-method"),
  { designFingerprint } = get("operations");
const rect = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const obj = (id, extra = {}) =>
  makeObject({
    id,
    name: id,
    paths: [rect(5, 5, 4, 20)],
    underlay: false,
    pull: 0,
    ...extra,
  });
const project = (objects) => ({
  version: 1,
  name: "QA",
  width: 80,
  height: 70,
  hoopWidth: 80,
  hoopHeight: 70,
  workspaceMode: "freeform",
  fabric: "cotton",
  source: "manual",
  notes: [],
  objects,
});
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS", name);
}
test("Secure UUID fallback works without the secure-context randomUUID API", () => {
  const { createId } = get("id"),
    fallback = { getRandomValues: (array) => crypto.getRandomValues(array) };
  const ids = Array.from({ length: 100 }, () => createId(fallback));
  assert.equal(new Set(ids).size, 100);
  for (const id of ids)
    assert.match(
      id,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
});
test("CIEDE2000 published reference pairs, symmetry and zero distance", () => {
  // Sharma, Wu & Dalal (2005), supplementary test data. These are numeric
  // reference values, not the authors' MATLAB/Excel implementation.
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
  ];
  for (const [a, b, expected] of pairs) {
    assert.ok(Math.abs(deltaE2000(a, b) - expected) < 0.0001);
    assert.ok(Math.abs(deltaE2000(a, b) - deltaE2000(b, a)) < 1e-10);
    assert.equal(deltaE2000(a, a), 0);
  }
  assert.throws(() => deltaE2000([NaN, 0, 0], [0, 0, 0]));
});
test("Touching shades stay distinct; explicit override merges without stale thread assignments", () => {
  const p = project([
    obj("a", { color: "#214f42" }),
    obj("b", {
      color: "#224f42",
      thread: {
        brand: "Test",
        line: "",
        code: "B",
        name: "B",
        color: "#224f42",
      },
    }),
  ]);
  const options = { ...DEFAULT_OPTIMIZE, mergeColors: true, tolerance: 3 };
  assert.ok(mapColors(p, options).every((m) => m.from === m.to));
  const merged = sequenceProject(
    p,
    { ...options, preserveContrast: false },
    generatePlan(p),
  );
  assert.equal(new Set(merged.project.objects.map((o) => o.color)).size, 1);
  const changed = merged.project.objects.find((o) => o.id === "b");
  assert.equal(changed.thread, undefined);
});
test("No merge chains erase touching contrast across retained groups", () => {
  const p = project([
    obj("a", { color: "#224f42", paths: [rect(0, 0, 5, 5)] }),
    obj("b", { color: "#234f42", paths: [rect(20, 0, 5, 5)] }),
    obj("c", { color: "#244f42", paths: [rect(20, 0, 5, 5)] }),
  ]);
  const mapping = mapColors(p, {
    ...DEFAULT_OPTIMIZE,
    mergeColors: true,
    tolerance: 5,
  });
  assert.notEqual(
    mapping.find((m) => m.from === "#234f42").to,
    mapping.find((m) => m.from === "#244f42").to,
  );
});
test("Auto-digitizing infers actual paired rails and preserves exact colour", () => {
  const p = project([obj("ribbon", { color: "#010203", colorLocked: true })]);
  const result = autoDigitizeProject(p, DEFAULT_AUTO);
  validateProject(result.project);
  assert.equal(result.project.objects[0].type, "satin-column");
  assert.equal(result.project.objects[0].color, "#010203");
  assert.ok(generatePlan(result.project).stitchCount > 50);
  assert.deepEqual(p.objects[0].paths, [rect(5, 5, 4, 20)]);
});
test("Curved monotone ribbon retains its contour within 2.5% area", () => {
  const left = Array.from({ length: 41 }, (_, i) => ({
    x: 10 + Math.sin((i / 40) * Math.PI) * 6,
    y: 5 + i * 0.5,
  }));
  const path = [
    ...left,
    ...left.map((p) => ({ x: p.x + 3, y: p.y })).reverse(),
  ];
  const rails = inferSatinRails(obj("curve", { paths: [path] }), 7);
  assert.ok(rails);
  assert.ok(rails.error < 0.025);
  assert.ok(rails.maxWidth <= 7);
});
test("Holes, locks, hand methods and unselected objects are retained", () => {
  const p = project([
    obj("hole", { paths: [rect(5, 5, 30, 25), rect(15, 12, 6, 6)] }),
    obj("lock", { locked: true }),
    obj("hand", { type: "motif" }),
    obj("outline", { type: "run", closed: [true] }),
  ]);
  const result = autoDigitizeProject(p, DEFAULT_AUTO);
  assert.equal(result.project.objects[0].type, "tatami");
  assert.equal(result.project.objects[0].paths.length, 2);
  assert.deepEqual(result.project.objects.slice(1), p.objects.slice(1));
  assert.deepEqual(
    autoDigitizeProject(p, { ...DEFAULT_AUTO, ids: ["lock"] }).project,
    p,
  );
});
test("Pixel coverage roundtrip preserves a ring, thin bridges and isolated detail", () => {
  const w = 64,
    h = 64,
    rgba = new Uint8ClampedArray(w * h * 4),
    labels = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 31.5, y - 31.5);
      const filled =
        (r > 14 && r < 25) ||
        (x === 31 && y > 10 && y < 51) ||
        (x === 3 && y === 3);
      if (filled) {
        rgba.set([12, 80, 54, 255], (y * w + x) * 4);
        labels[y * w + x] = 0;
      }
    }
  const traced = tracePixels(
    rgba,
    w,
    h,
    {
      colors: 1,
      resolution: 64,
      minArea: 0,
      widthMM: 64,
      removeWhite: false,
      simplifyMM: 1,
      smoothCurves: true,
      preservePixels: true,
      preserveHoles: true,
    },
    "ring",
  );
  assert.ok(matchesPixelMask(traced.objects[0].paths, labels, w, h, 0));
  validateProject(traced);
});
test("Low-contrast specks merge to neighbours; high-contrast intricacies survive", () => {
  const w = 20,
    h = 20,
    rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([40, 80, 60, 255], i * 4);
  rgba.set([43, 80, 60, 255], (5 * w + 5) * 4);
  rgba.set([250, 0, 0, 255], (12 * w + 12) * 4);
  const p = tracePixels(
    rgba,
    w,
    h,
    {
      colors: 3,
      resolution: 20,
      widthMM: 20,
      minArea: 2,
      removeWhite: false,
      islandAction: "merge",
      palette: ["#28503c", "#2b503c", "#fa0000"],
    },
    "specks",
  );
  assert.equal(p.objects.length, 2);
  assert.ok(p.objects.some((o) => o.color === "#fa0000"));
});
test("All specialty fills and connectors stay outside an interior hole", () => {
  for (const type of [
    "island-coil",
    "square-fill",
    "double-square",
    "cross",
    "half-cross",
    "quarter-cross",
    "petite-cross",
  ]) {
    const o = obj(type, {
      type,
      paths: [rect(5, 5, 24, 22), rect(13, 13, 7, 7)],
      closed: [true, true],
      spacing: 1,
      crossSize: 2,
    });
    const plan = generatePlan(project([o]));
    assert.ok(plan.stitchCount > 20);
    for (let i = 1; i < plan.stitches.length; i++)
      if (plan.stitches[i].command === "stitch")
        assert.ok(
          segmentInside(
            plan.stitches[i - 1],
            plan.stitches[i],
            o.paths,
            "evenodd",
            0.001,
          ),
          type,
        );
  }
});
test("Raised satin adds genuine passes and settings invalidate sew-out qualification", () => {
  const p = project([obj("satin", { type: "satin" })]);
  const raised = project([
    obj("satin", { type: "raised-satin", satinLayers: 3 }),
  ]);
  assert.ok(
    generatePlan(raised).stitchCount > generatePlan(p).stitchCount * 2.7,
  );
  const four = project([{ ...raised.objects[0], satinLayers: 4 }]);
  assert.notEqual(designFingerprint(raised), designFingerprint(four));
  assert.throws(() =>
    validateProject(project([obj("bad", { satinLayers: 2.5 })])),
  );
});
test("Danish order changes traversal; half/quarter/petite methods are distinct", () => {
  const plans = ["cross", "half-cross", "quarter-cross", "petite-cross"].map(
    (type) =>
      generatePlan(
        project([
          obj(type, {
            type,
            paths: [rect(4, 4, 8, 8)],
            crossSize: 2,
            crossOrder: "danish",
          }),
        ]),
      ),
  );
  assert.equal(new Set(plans.map((p) => JSON.stringify(p.stitches))).size, 4);
  const o = obj("grid", {
    type: "cross",
    paths: [rect(4, 4, 8, 8)],
    crossSize: 2,
  });
  assert.notDeepEqual(
    generatePlan(project([o])).stitches,
    generatePlan(project([{ ...o, crossOrder: "danish" }])).stitches,
  );
});
test("Keyboard registry has no conflicting active chords and all bindings resolve", () => {
  const seen = new Set();
  for (const s of SHORTCUTS) {
    const identity = [s.key, !!s.mod, !!s.alt, !!s.shift].join(":");
    assert.ok(!seen.has(identity), identity);
    seen.add(identity);
    const code =
      s.key === "add"
        ? "NumpadAdd"
        : s.key === "subtract"
          ? "NumpadSubtract"
          : /^\d$/.test(s.key)
            ? "Digit" + s.key
            : "Key" + s.key.toUpperCase();
    const event = {
      key: s.key,
      code,
      ctrlKey: !!s.mod,
      metaKey: false,
      altKey: !!s.alt,
      shiftKey: !!s.shift,
    };
    assert.equal(matchShortcut(event)?.id, s.id);
    if (s.mod)
      assert.equal(
        matchShortcut({ ...event, ctrlKey: false, metaKey: true })?.id,
        s.id,
      );
  }
});
test("Wrong modifiers do not activate unmodified Wilcom tools", () => {
  assert.equal(
    matchShortcut({
      key: "p",
      code: "KeyP",
      ctrlKey: false,
      metaKey: false,
      altKey: true,
      shiftKey: false,
    }),
    undefined,
  );
  assert.equal(
    matchShortcut({
      key: "h",
      code: "KeyH",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    })?.id,
    "tool:nodes",
  );
});
test("Method conversion retains Column C coverage and clears inappropriate cross underlay", () => {
  const c = obj("c", {
    type: "column-c",
    paths: [
      [
        { x: 5, y: 5 },
        { x: 5, y: 25 },
      ],
    ],
    closed: [false],
    lineWidth: 4,
    underlay: true,
  });
  const next = changeStitchMethod(c, "cross");
  assert.ok(next.closed.every(Boolean));
  assert.equal(next.underlay, false);
  assert.ok(generatePlan(project([next])).stitchCount > 0);
  assert.equal(Object.keys(STITCH_NAMES).length - 1, 32);
});
console.log(`${passed} refinement checks passed.`);
