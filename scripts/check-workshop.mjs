// Exercise public domain operations with geometric invariants and output metrics.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-workshop-"));
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
    ...["shape-edit", "optimization", "engine", "project", "export"].map(
      (x) => `lib/embroidery/${x}.ts`,
    ),
  ],
  { encoding: "utf8" },
);
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const require = createRequire(import.meta.url),
  get = (name) => require(join(out, name + ".js"));
const { makeObject } = get("types"),
  { inside, bounds, distance, segmentInside } = get("geometry"),
  { generatePlan } = get("engine"),
  { validateProject } = get("project");
const {
  booleanPolygons,
  normalizePolygons,
  offsetPolygons,
  polygonArea,
  knifeObject,
  objectPolygons,
} = get("polygons");
const { editShapes, exportCutSVG } = get("shape-edit"),
  {
    DEFAULT_OPTIMIZE,
    sequenceProject,
    mapColors,
    colorDifference,
    planMetrics,
  } = get("optimization"),
  { designFingerprint } = get("operations");
const square = (x, y, w) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + w },
  { x, y: y + w },
];
const object = (id, x = 0, y = 0, w = 10, extra = {}) =>
  makeObject({
    id,
    name: id,
    paths: [square(x, y, w)],
    pull: 0,
    underlay: false,
    ...extra,
  });
const project = (objects) => ({
  version: 1,
  name: "Workshop",
  width: 100,
  height: 100,
  hoopWidth: 200,
  hoopHeight: 200,
  fabric: "cotton",
  source: "manual",
  notes: [],
  objects,
});
const edit = (p, action, amount = 0.3, extra = {}) =>
  editShapes(p, {
    action,
    ids: p.objects.map((o) => o.id),
    amount,
    seed: "test-seed",
    ...extra,
  });
let count = 0;
function check(name, fn) {
  fn();
  count++;
  console.log("PASS " + name);
}
function near(a, b, tol = 1e-6) {
  assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);
}
check(
  "Boolean operations preserve analytic areas and opposite-winding holes",
  () => {
    const a = normalizePolygons([square(0, 0, 10)]),
      b = normalizePolygons([square(5, 0, 10)]);
    for (const [op, area] of [
      ["union", 150],
      ["intersection", 50],
      ["difference", 50],
      ["xor", 100],
    ])
      near(polygonArea(booleanPolygons(a, b, op)), area);
    const ring = normalizePolygons([square(0, 0, 20), square(6, 6, 8)]);
    near(polygonArea(ring), 336);
    assert.ok(!inside({ x: 10, y: 10 }, ring, "nonzero"));
    near(
      polygonArea(
        normalizePolygons([square(0, 0, 20), square(6, 6, 8)], "nonzero"),
      ),
      400,
    );
  },
);
check(
  "Knife conserves ring area and splits running paths without invented stitches",
  () => {
    const ring = object("ring", 0, 0, 20, {
      paths: [square(0, 0, 20), square(6, 6, 8)],
    });
    for (const [a, b] of [
      [
        { x: 10, y: -2 },
        { x: 10, y: 22 },
      ],
      [
        { x: -2, y: 10 },
        { x: 22, y: 10 },
      ],
      [
        { x: -2, y: -2 },
        { x: 22, y: 22 },
      ],
    ]) {
      const cut = knifeObject(ring, a, b);
      assert.ok(cut.length >= 2);
      near(
        cut.reduce((sum, o) => sum + polygonArea(objectPolygons(o)), 0),
        336,
        0.01,
      );
      assert.ok(
        cut.every((o) => !inside({ x: 10, y: 10 }, o.paths, o.fillRule)),
      );
    }
    const run = object("run", 0, 0, 1, {
      type: "run",
      paths: [
        [
          { x: 0, y: 5 },
          { x: 10, y: 5 },
        ],
      ],
      closed: [false],
    });
    const parts = knifeObject(run, { x: 4, y: 0 }, { x: 4, y: 10 });
    assert.equal(parts.length, 2);
    assert.deepEqual(parts[0].paths[0].at(-1), parts[1].paths[0][0]);
    near(parts[0].paths[0].at(-1).x, 4);
    assert.equal(knifeObject(run, { x: 40, y: 0 }, { x: 40, y: 10 })[0], run);
  },
);
check(
  "Offsets contract shells, expand holes and cleanly collapse narrow geometry",
  () => {
    const original = normalizePolygons([square(0, 0, 20), square(7, 7, 6)]),
      inset = offsetPolygons(original, -1);
    const b = bounds(inset);
    near(b.minX, 1);
    near(b.maxX, 19);
    assert.ok(!inside({ x: 6.1, y: 10 }, inset, "nonzero"));
    assert.ok(polygonArea(inset) > 260 && polygonArea(inset) < 261);
    assert.deepEqual(
      offsetPolygons(normalizePolygons([square(0, 0, 1)]), -1),
      [],
    );
  },
);
check("Eraser removes only its swept area and retains holes", () => {
  const p = project([
    object("a", 0, 0, 20, { paths: [square(0, 0, 20), square(6, 6, 8)] }),
    object("b", 30, 0, 10),
  ]);
  const r = edit(p, "erase", 2, {
    points: [
      { x: 3, y: -2 },
      { x: 3, y: 22 },
    ],
  });
  assert.equal(r.changed, 1);
  const cut = r.project.objects.filter((o) => o.id !== "b");
  near(
    cut.reduce((a, o) => a + polygonArea(objectPolygons(o)), 0),
    296,
    0.02,
  );
  assert.ok(cut.every((o) => !inside({ x: 10, y: 10 }, o.paths, o.fillRule)));
  assert.equal(
    r.project.objects.find((o) => o.id === "b"),
    p.objects[1],
  );
});
check(
  "Overlap removal retains an allowance and never uses sparse fills as opaque cutters",
  () => {
    const base = object("base", 0, 0, 20),
      top = object("top", 5, 5, 10, { color: "#663399" });
    const r = edit(project([base, top]), "remove-overlaps", 0.5),
      lower = r.project.objects.filter((o) => o.id !== "top");
    assert.ok(
      lower.some((o) => inside({ x: 5.2, y: 10 }, o.paths, o.fillRule)),
    );
    assert.ok(
      lower.every((o) => !inside({ x: 10, y: 10 }, o.paths, o.fillRule)),
    );
    assert.equal(
      edit(project([base, { ...top, type: "motif" }]), "remove-overlaps")
        .changed,
      0,
    );
    const locked = { ...base, locked: true };
    assert.equal(
      edit(project([locked, top]), "remove-overlaps").project.objects[0],
      locked,
    );
  },
);
check(
  "Exact boundary intervals detect tiny holes missed by coarse sampling",
  () => {
    const hole = [
      { x: 1.03, y: 0.2 },
      { x: 1.08, y: 0.2 },
      { x: 1.08, y: 1.8 },
      { x: 1.03, y: 1.8 },
    ];
    assert.equal(
      segmentInside(
        { x: 0.1, y: 1 },
        { x: 1.9, y: 1 },
        [square(0, 0, 2), hole],
        "evenodd",
        0,
      ),
      false,
    );
  },
);
check(
  "Contour stitches and inset underlay remain inside their intended geometry",
  () => {
    const o = object("contour", 0, 0, 20, {
      type: "contour",
      paths: [square(0, 0, 20), square(7, 7, 6)],
      underlay: true,
      underlayKind: "edge",
      underlayInset: 1,
      length: 1.2,
      spacing: 0.6,
    });
    const p = generatePlan(project([o])),
      inset = offsetPolygons(o.paths, -1, o.fillRule);
    assert.ok(p.stitchCount > 100);
    for (let i = 1; i < p.stitches.length; i++) {
      const a = p.stitches[i - 1],
        b = p.stitches[i];
      if (b.command !== "stitch") continue;
      assert.ok(
        segmentInside(a, b, o.paths, o.fillRule, 0.03),
        "contour crosses a hole",
      );
      if (b.underlay)
        assert.ok(
          segmentInside(a, b, inset, "nonzero", 0.03),
          "underlay leaves its inset",
        );
      assert.ok(distance(a, b) <= 2.001);
    }
  },
);
check(
  "Complementary shading creates editable layers with a constant density budget",
  () => {
    const r = edit(project([object("shade", 0, 0, 24)]), "blend", 0, {
        color: "#d97651",
      }),
      [a, b] = r.project.objects;
    assert.equal(a.groupId, b.groupId);
    assert.notEqual(a.color, b.color);
    assert.equal(b.underlay, false);
    for (const t of [0, 0.2, 0.5, 0.8, 1])
      near(
        (1 - t) / a.spacing +
          t / a.spacingEnd +
          (1 - t) / b.spacing +
          t / b.spacingEnd,
        1 / 0.45,
      );
    const p = generatePlan(r.project);
    assert.ok(p.stitchCount > 500);
    assert.equal(p.colorChanges, 1);
    assert.deepEqual(validateProject(r.project), r.project);
  },
);
check(
  "Appliqué passes have fixed order, forced trims and physical cutting output",
  () => {
    const r = edit(project([object("patch", 5, 5, 20)]), "applique", 2),
      passes = r.project.objects;
    assert.deepEqual(
      passes.map((o) => o.type),
      ["run", "run", "zigzag"],
    );
    assert.ok(
      passes.every((o) => o.groupId === passes[0].groupId && o.forceTrim),
    );
    assert.deepEqual(
      passes.map((o) => o.pauseAfter),
      [true, true, false],
    );
    const plan = generatePlan({ ...r.project, trimDistance: 5 });
    assert.ok(plan.trimCount >= 3);
    const svg = exportCutSVG(r.project, [passes[0].id], 0);
    assert.match(svg, /width="100mm"/);
    assert.match(svg, /fill="none"/);
    assert.match(svg, /5\.000/);
  },
);
check(
  "Sequencing reduces color changes without crossing overlap or locked barriers",
  () => {
    const source = project([
      object("a", 0, 0, 5, { color: "#112233" }),
      object("b", 20, 0, 5, { color: "#aabbcc" }),
      object("c", 40, 0, 5, { color: "#112233" }),
    ]);
    const before = generatePlan(source),
      r = sequenceProject(
        source,
        { ...DEFAULT_OPTIMIZE, nearest: false },
        before,
      );
    assert.equal(generatePlan(r.project).colorChanges, 1);
    assert.equal(before.colorChanges, 2);
    const overlapping = project([
      object("a", 0, 0, 15, { color: "#112233" }),
      object("b", 5, 5, 15, { color: "#aabbcc" }),
      object("c", 10, 10, 15, { color: "#112233" }),
    ]);
    assert.deepEqual(
      sequenceProject(
        overlapping,
        DEFAULT_OPTIMIZE,
        generatePlan(overlapping),
      ).project.objects.map((o) => o.id),
      ["a", "b", "c"],
    );
    const locked = {
      ...source,
      objects: source.objects.map((o, i) =>
        i === 1 ? { ...o, locked: true } : o,
      ),
    };
    assert.deepEqual(
      sequenceProject(
        locked,
        DEFAULT_OPTIMIZE,
        generatePlan(locked),
      ).project.objects.map((o) => o.id),
      ["a", "b", "c"],
    );
  },
);
check(
  "Closest entries reverse eligible runs and respect explicit direction locks",
  () => {
    const run = object("run", 0, 0, 1, {
      type: "run",
      paths: [
        [
          { x: 0, y: 50 },
          { x: 49, y: 50 },
        ],
      ],
      closed: [false],
      tieIn: false,
      tieOut: false,
    });
    const p = project([run]),
      r = sequenceProject(p, DEFAULT_OPTIMIZE, generatePlan(p));
    assert.equal(r.reversed, 1);
    near(r.project.objects[0].paths[0][0].x, 49);
    const locked = project([{ ...run, directionLocked: true }]);
    assert.equal(
      sequenceProject(locked, DEFAULT_OPTIMIZE, generatePlan(locked)).reversed,
      0,
    );
  },
);
check(
  "Colour merging obeys direct-distance bounds, exact locks and default preservation",
  () => {
    const p = project([
      object("a", 0, 0, 5, { color: "#22776a" }),
      object("b", 20, 0, 5, { color: "#21776a", colorLocked: true }),
      object("c", 40, 0, 5, { color: "#fa0022" }),
    ]);
    const unchanged = mapColors(p, DEFAULT_OPTIMIZE);
    assert.ok(unchanged.every((m) => m.from === m.to));
    const mapping = mapColors(p, {
      ...DEFAULT_OPTIMIZE,
      mergeColors: true,
      tolerance: 3,
    });
    assert.equal(mapping.find((m) => m.from === "#22776a").to, "#21776a");
    assert.equal(mapping.find((m) => m.from === "#21776a").protected, true);
    assert.equal(mapping.find((m) => m.from === "#fa0022").to, "#fa0022");
    near(colorDifference("#ffffff", "#000000"), 100, 0.001);
    assert.ok(mapping.every((m) => m.delta <= 3));
  },
);
check(
  "Trim optimization changes commands but preserves stitches and protected trims",
  () => {
    const a = object("a", 0, 0, 1, {
        type: "run",
        paths: [
          [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
          ],
        ],
        closed: [false],
        tieIn: false,
        tieOut: false,
      }),
      b = {
        ...a,
        id: "b",
        paths: [
          [
            { x: 6, y: 0 },
            { x: 10, y: 0 },
          ],
        ],
      };
    const p = project([a, b]),
      before = generatePlan(p),
      after = generatePlan({ ...p, trimDistance: 2 });
    assert.equal(after.trimCount, before.trimCount - 1);
    assert.equal(after.stitchCount, before.stitchCount);
    assert.equal(after.blocks.length, 2);
    assert.equal(after.blocks.at(-1).end, after.stitches.length);
    assert.equal(
      generatePlan({
        ...p,
        trimDistance: 2,
        objects: [{ ...a, forceTrim: true }, b],
      }).trimCount,
      before.trimCount,
    );
    assert.equal(
      generatePlan({
        ...p,
        trimDistance: 2,
        objects: [a, { ...b, color: "#aabbcc" }],
      }).trimCount,
      before.trimCount,
    );
    assert.equal(planMetrics(after).travel, planMetrics(before).travel);
  },
);
check(
  "New stitch settings round-trip and invalidate prior sew-out results",
  () => {
    const base = project([object("a")]);
    for (const patch of [
      { underlayInset: 0.9 },
      { tatamiOffset: 0.5 },
      { spacingEnd: 1.2 },
      { forceTrim: true },
    ]) {
      const p = { ...base, objects: [{ ...base.objects[0], ...patch }] };
      assert.deepEqual(validateProject(p), p);
      assert.notEqual(designFingerprint(base), designFingerprint(p));
    }
    assert.notEqual(
      designFingerprint(base),
      designFingerprint({ ...base, trimDistance: 2 }),
    );
    assert.throws(() => validateProject({ ...base, trimDistance: Infinity }));
    assert.throws(() =>
      validateProject({
        ...base,
        objects: [{ ...base.objects[0], tatamiOffset: 2 }],
      }),
    );
  },
);
console.log(`${count} workshop checks passed.`);
