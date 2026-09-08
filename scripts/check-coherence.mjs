import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-coherence-"));
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
    "lib/embroidery/engine.ts",
    "lib/embroidery/native-export.ts",
    "lib/embroidery/continuity.ts",
  ],
  { encoding: "utf8" },
);
assert.equal(c.status, 0, c.stdout + c.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const req = createRequire(import.meta.url),
  get = (n) => req(join(out, n + ".js"));
const { generatePlan } = get("engine"),
  { makeObject, LINE_TYPES, STITCH_NAMES } = get("types"),
  { analyzeContinuity } = get("continuity"),
  { segmentInside, distance } = get("geometry"),
  { outlinePaths } = get("operations"),
  { exportNative } = get("native-export"),
  { machineStream } = get("machine-stream"),
  { zipFiles } = get("export"),
  { createFillRouter } = get("fill-routing"),
  { validateProject, resizeProject } = get("project");
const rect = (x, y, w, h = w) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const line = [
  { x: 5, y: 5 },
  { x: 20, y: 5 },
  { x: 25, y: 15 },
];
const base = (objects) => ({
  version: 1,
  name: "Structure qualification",
  width: 100,
  height: 100,
  hoopWidth: 110,
  hoopHeight: 110,
  fabric: "cotton",
  source: "manual",
  notes: [],
  objects,
});
const obj = (type, hole = false, extra = {}) => {
  const paths =
    type === "satin-column"
      ? [
          [
            { x: 5, y: 5 },
            { x: 5, y: 25 },
          ],
          [
            { x: 10, y: 5 },
            { x: 10, y: 25 },
          ],
        ]
      : LINE_TYPES.includes(type)
        ? [line]
        : [rect(5, 5, 25), ...(hole ? [rect(12, 12, 10)] : [])];
  return makeObject({
    id: type,
    name: STITCH_NAMES[type],
    type,
    paths,
    closed: paths.map(
      () => !LINE_TYPES.includes(type) && type !== "satin-column",
    ),
    angle: 0,
    spacing: 0.4,
    pull: 0,
    underlay: false,
    ...extra,
  });
};
const area = [
  "tatami",
  "satin",
  "raised-satin",
  "program-split",
  "square-fill",
  "double-square",
  "contour",
  "island-coil",
  "spiral",
  "ripple",
  "satin-column",
  "column-c",
];
const audit = [];
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS", name);
}
function contained(o, plan) {
  const paths = outlinePaths(o);
  for (let i = 1; i < plan.stitches.length; i++) {
    const a = plan.stitches[i - 1],
      b = plan.stitches[i];
    if (b.command !== "stitch") continue;
    assert.ok(
      segmentInside(a, b, paths, o.fillRule, 1e-6),
      `${o.type} left its filled region: ${JSON.stringify({ a, b })}`,
    );
    assert.ok(
      distance(a, b) <= 7.001,
      `${o.type} exceeds the needle length limit`,
    );
  }
}
test("All 32 methods preserve one editable source object and report their actual sewing sections", () => {
  for (const type of Object.keys(STITCH_NAMES).filter((t) => t !== "none")) {
    const record = { type };
    for (const sample of ["solid", "hole"]) {
      const o = obj(type, sample === "hole"),
        p = base([o]),
        original = JSON.stringify(p),
        plan = generatePlan(p);
      assert.equal(
        JSON.stringify(p),
        original,
        "Generation mutated the source object",
      );
      assert.equal(validateProject(JSON.parse(original)).objects.length, 1);
      assert.equal(resizeProject(p, 120, 120).objects[0].type, type);
      assert.equal(plan.blocks.length, 1);
      const stats = analyzeContinuity(plan).get(o.id);
      assert.equal(stats.stitches, plan.stitchCount);
      assert.ok(stats.sections > 0);
      record[sample] = stats;
    }
    audit.push(record);
  }
  console.log(
    audit
      .map(
        (r) =>
          `${r.type}: ${r.solid.sections}/${r.hole.sections} sections (solid/hole)`,
      )
      .join("\n"),
  );
});
test("Continuous area methods sew a solid region as one sequence", () => {
  for (const type of area) {
    const o = obj(type),
      plan = generatePlan(base([o]));
    assert.equal(analyzeContinuity(plan).get(o.id).sections, 1, type);
    assert.equal(plan.trimCount, 1, type);
  }
});
test("Continuous area fills route around holes without adding a trim or stitching through the cutout", () => {
  for (const type of area.filter(
    (t) => !LINE_TYPES.includes(t) && t !== "satin-column",
  )) {
    const o = obj(type, true),
      plan = generatePlan(base([o]));
    assert.equal(analyzeContinuity(plan).get(o.id).sections, 1, type);
    contained(o, plan);
  }
});
test("Parallel satin alternates edges with no ladder of short edge-only stitches", () => {
  for (const type of ["satin", "raised-satin"]) {
    const o = obj(type, false, {
      paths: [rect(5, 5, 4, 20)],
      tieIn: false,
      tieOut: false,
    });
    const plan = generatePlan(base([o]));
    const top = plan.stitches.filter((s) => s.command === "stitch");
    const crossings = top.filter(
      (s, i) => i && Math.abs(s.x - top[i - 1].x) > 3.99,
    );
    assert.ok(
      crossings.length > (type === "satin" ? 95 : 285),
      `${type} lacks edge-to-edge structure`,
    );
    assert.equal(plan.jumpCount, 1);
    contained(o, plan);
  }
});
test("Program split retains patterned penetrations when a region is traversed backwards", () => {
  const o = obj("program-split", true, {
      splitPattern: "diamond",
      patternSize: 4,
    }),
    plan = generatePlan(base([o]));
  assert.equal(plan.jumpCount, 1);
  for (let row = 0; row < 62; row++) {
    const y = 5.2 + row * 0.4;
    const points = plan.stitches.filter(
      (s) => s.command === "stitch" && Math.abs(s.y - y) < 1e-6,
    );
    assert.ok(points.length >= 4, "Lost a patterned row");
  }
  contained(o, plan);
});
test("Underlay and cover remain connected within the same region", () => {
  for (const type of [
    "tatami",
    "satin",
    "program-split",
    "satin-column",
    "column-c",
  ])
    for (const kind of ["edge", "fill"]) {
      const o = obj(type, true, { underlay: true, underlayKind: kind }),
        plan = generatePlan(base([o]));
      assert.equal(plan.jumpCount, 1, `${type}/${kind}`);
      contained(o, plan);
    }
});
test("Motif runs follow their original baseline corners and keep all repeated motifs together", () => {
  const path = [
    { x: 5, y: 5 },
    { x: 17, y: 5 },
    { x: 17, y: 22 },
  ];
  const o = obj("motif-run", false, {
      paths: [path],
      patternSize: 8,
      tieIn: false,
      tieOut: false,
    }),
    plan = generatePlan(base([o]));
  assert.equal(plan.jumpCount, 1);
  assert.equal(plan.trimCount, 1);
  assert.ok(
    plan.stitches.some(
      (s) =>
        s.command === "stitch" &&
        Math.abs(s.x - 17) < 1e-6 &&
        Math.abs(s.y - 5) < 1e-6,
    ),
    "Baseline corner was cut off",
  );
  assert.ok(
    generatePlan(base([{ ...o, connector: "trim" }])).trimCount > 1,
    "Explicit motif gaps were ignored",
  );
});
test("Touching run paths join continuously while separate run paths preserve their gaps", () => {
  for (const type of ["run", "triple", "manual"]) {
    const o = obj(type, false, {
      paths: [
        [
          { x: 5, y: 5 },
          { x: 15, y: 5 },
        ],
        [
          { x: 15, y: 5 },
          { x: 15, y: 15 },
        ],
      ],
      closed: [false, false],
    });
    assert.equal(generatePlan(base([o])).jumpCount, 1, type);
    const separate = {
      ...o,
      paths: [
        o.paths[0],
        [
          { x: 25, y: 5 },
          { x: 25, y: 15 },
        ],
      ],
    };
    assert.equal(generatePlan(base([separate])).jumpCount, 2, type);
  }
});
test("Fill connectors respect distinct islands and forced trims without splitting each row", () => {
  for (const connector of ["auto", "jump", "trim"]) {
    const o = obj("tatami", false, {
        paths: [rect(5, 5, 20), rect(30, 5, 20)],
        closed: [true, true],
        connector,
      }),
      plan = generatePlan(base([o]));
    assert.equal(plan.jumpCount, 2);
    assert.equal(plan.trimCount, 2);
    contained(o, plan);
  }
});
test("Navigation rejects disconnected regions and solves a concavity across multiple turns", () => {
  const c = [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 30, y: 5 },
    { x: 5, y: 5 },
    { x: 5, y: 25 },
    { x: 30, y: 25 },
    { x: 30, y: 30 },
    { x: 0, y: 30 },
  ];
  const route = createFillRouter([c], "evenodd")(
    { x: 29, y: 2 },
    { x: 29, y: 28 },
  );
  assert.ok(route && route.length > 2);
  for (let i = 1; i < route.length; i++)
    assert.ok(segmentInside(route[i - 1], route[i], [c], "evenodd", 1e-6));
  assert.equal(
    createFillRouter([rect(0, 0, 5), rect(10, 0, 5)], "evenodd")(
      { x: 2, y: 2 },
      { x: 12, y: 2 },
    ),
    null,
  );
});
test("Decorative fill and cross-stitch clipping still preserves every hole", () => {
  for (const type of [
    "wave",
    "meander",
    "coil-fill",
    "motif",
    "cross",
    "half-cross",
    "quarter-cross",
    "petite-cross",
  ]) {
    const o = obj(type, true),
      plan = generatePlan(base([o]));
    contained(o, plan);
  }
});
const coupon = base([
  obj("tatami", true),
  obj("satin", false, { paths: [rect(35, 5, 4, 25)], color: "#a85467" }),
  obj("program-split", false, { paths: [rect(45, 5, 25)], color: "#7c6294" }),
  obj("square-fill", false, { paths: [rect(5, 40, 25)], color: "#6c7848" }),
  obj("motif-run", false, {
    paths: [
      [
        { x: 40, y: 45 },
        { x: 65, y: 45 },
        { x: 65, y: 60 },
      ],
    ],
    color: "#bc8740",
  }),
]);
const plan = generatePlan(coupon),
  files = [];
test("DST, PES, JEF and EXP preserve the coherent needle sequence through an independent decoder", () => {
  for (const format of ["dst", "pes", "jef", "exp"]) {
    const data = exportNative(coupon, plan, format),
      file = join(out, "coherence." + format);
    writeFileSync(file, data);
    const r = spawnSync("python", ["tests/decode-machine.py", file], {
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(r.status, 0, r.stderr);
    const decoded = JSON.parse(r.stdout).stitches,
      needles = decoded
        .filter((s) => (s[2] & 255) === 0)
        .map((s) => s.slice(0, 2));
    assert.deepEqual(
      needles,
      machineStream(coupon, plan, format)
        .filter((s) => s.command === "stitch")
        .map((s) => [s.x, s.y]),
    );
    assert.equal(
      decoded.filter((s) => (s[2] & 255) === 5).length,
      plan.colorChanges,
    );
    files.push({ name: "stitch-structure." + format, data });
  }
});
if (process.argv.includes("--write-fixture")) {
  const directory = resolve("docs/qualification");
  mkdirSync(directory, { recursive: true });
  const enc = new TextEncoder();
  files.push({
    name: "stitch-structure.threadform.json",
    data: enc.encode(JSON.stringify(coupon, null, 2)),
  });
  files.push({
    name: "READ-ME.txt",
    data: enc.encode(
      "Threadform stitch-structure comparison. Contains tatami with a hole, narrow satin, program split, square fill and motif run. Each source object remains editable in Threadform and each filled region is connected in the machine stitch data. Compare unchanged stitches in Wilcom with Objects/Outlines disabled, then open another copy with recognition enabled to inspect reconstructed objects. These formats do not encode native Wilcom EMB objects. No direct Wilcom import or physical sew-out is claimed.\n",
    ),
  });
  writeFileSync(
    join(directory, "stitch-structure-comparison.zip"),
    zipFiles(files),
  );
  writeFileSync(
    join(directory, "stitch-coherence-audit.json"),
    JSON.stringify(audit, null, 2),
  );
}
console.log(`${passed} stitch coherence checks passed.`);
