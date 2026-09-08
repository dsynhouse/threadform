import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-digitizing-"));
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
      "engine",
      "project",
      "export",
      "raster",
      "digitizing",
      "threads",
      "dst-import",
      "approval-pdf",
      "samples",
    ].map((n) => `lib/embroidery/${n}.ts`),
  ],
  { encoding: "utf8" },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const require = createRequire(import.meta.url),
  get = (n) => require(join(out, n + ".js"));
const { makeObject, LINE_TYPES, STITCH_NAMES } = get("types"),
  { generatePlan } = get("engine"),
  { validateProject } = get("project"),
  { exportDST, exportSVG } = get("export"),
  { decodeDSTDelta, importDST } = get("dst-import"),
  { distance, inside, segmentInside } = get("geometry"),
  { tracePixels } = get("raster");
const rect = (x = 10, y = 10, w = 30, h = 24) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const base = (objects) => ({
  version: 1,
  name: "Digitizing test",
  width: 60,
  height: 50,
  hoopWidth: 60,
  hoopHeight: 50,
  workspaceMode: "freeform",
  fabric: "linen",
  source: "manual",
  objects,
  notes: [],
});
const shape = (type) =>
  makeObject({
    id: type,
    name: type,
    type,
    paths: [rect()],
    closed: [true],
    underlay: false,
    pull: 0,
    spacing: 0.65,
    patternSize: 5,
    tieIn: false,
    tieOut: false,
  });
let count = 0;
async function test(name, fn) {
  await fn();
  count++;
  console.log("PASS", name);
}
await test("All 32 stitch methods generate finite bounded lockstitch paths", () => {
  const signatures = new Set();
  for (const type of Object.keys(STITCH_NAMES).filter((t) => t !== "none")) {
    let o = shape(type);
    if (LINE_TYPES.includes(type))
      o = {
        ...o,
        paths: [
          [
            { x: 10, y: 22 },
            { x: 25, y: 14 },
            { x: 42, y: 25 },
          ],
        ],
        closed: [false],
      };
    if (type === "satin-column")
      o = {
        ...o,
        paths: [
          [
            { x: 10, y: 10 },
            { x: 20, y: 25 },
          ],
          [
            { x: 14, y: 10 },
            { x: 24, y: 25 },
          ],
        ],
        closed: [false, false],
      };
    const plan = generatePlan(validateProject(base([o])));
    assert.ok(plan.stitchCount > 3, type);
    assert.ok(
      plan.stitches.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      type,
    );
    for (let i = 1; i < plan.stitches.length; i++)
      if (plan.stitches[i].command === "stitch")
        assert.ok(
          distance(plan.stitches[i - 1], plan.stitches[i]) <= 7.001,
          type,
        );
    signatures.add(
      JSON.stringify(plan.stitches.map((p) => [p.x, p.y, p.command])),
    );
  }
  assert.equal(
    signatures.size,
    Object.keys(STITCH_NAMES).length - 1,
    "No advertised stitch method may alias another generator",
  );
});
await test("New fill programs retain holes and do not sew connectors across voids", () => {
  for (const type of [
    "program-split",
    "spiral",
    "ripple",
    "coil-fill",
    "meander",
  ]) {
    const o = { ...shape(type), paths: [rect(), rect(22, 18, 6, 6)] },
      p = generatePlan(base([o]));
    for (let i = 1; i < p.stitches.length; i++) {
      const s = p.stitches[i],
        prev = p.stitches[i - 1];
      if (s.command === "stitch")
        assert.ok(
          segmentInside(prev, s, o.paths, "evenodd", 0.001),
          `${type} crossed a void at ${i}`,
        );
    }
  }
});
await test("Custom split tiles move penetrations while preserving complete fill rows", () => {
  const a = shape("program-split"),
    tile = [
      [
        { x: 0.2, y: 0 },
        { x: 0.2, y: 1 },
      ],
    ],
    b = { ...a, customPattern: tile, splitPattern: "custom" };
  const p = generatePlan(base([a])),
    q = generatePlan(base([b]));
  assert.notDeepEqual(p.stitches, q.stitches);
  assert.deepEqual(p.bounds, q.bounds);
  assert.equal(p.threadMM.toFixed(2), q.threadMM.toFixed(2));
  const feather = generatePlan(
    base([{ ...a, edgeEffect: "feather", effectDepth: 1 }]),
  );
  assert.ok(
    feather.bounds.minX >= p.bounds.minX - 0.001 &&
      feather.bounds.maxX <= p.bounds.maxX + 0.001,
  );
});
await test("Column A preserves rung corners; B handles unequal edges; C preserves centreline width", () => {
  const { digitizeCurve, pairedCurveRails, pairRails, centrelineRails } =
    get("digitizing");
  const points = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 6, y: 10, curve: true },
    { x: 10, y: 11, curve: true },
    { x: 0, y: 20 },
    { x: 4, y: 20 },
  ];
  const rails = pairedCurveRails(points);
  assert.equal(rails[0].length, rails[1].length);
  for (let i = 0; i < points.length; i++)
    assert.ok(rails[i % 2].some((p) => distance(p, points[i]) < 1e-6));
  const corners = [
    { x: 0, y: 0 },
    { x: 5, y: 10 },
    { x: 10, y: 0 },
  ];
  assert.deepEqual(digitizeCurve(corners), corners);
  assert.ok(
    digitizeCurve(corners.map((p) => ({ ...p, curve: true }))).length > 3,
  );
  const paired = pairRails(
    [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
    ],
    [
      { x: 5, y: 20 },
      { x: 8, y: 10 },
      { x: 5, y: 0 },
    ],
  );
  assert.deepEqual(paired[1][0], { x: 5, y: 0 });
  assert.equal(paired[0].length, paired[1].length);
  const [a, b] = centrelineRails(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
    4,
  );
  a.forEach((p, i) => assert.ok(Math.abs(distance(p, b[i]) - 4) < 1e-6));
});
await test("Freeform geometry exports beyond artboard; DST obeys custom origin and end movement", () => {
  const o = {
      ...shape("run"),
      paths: [
        [
          { x: -12, y: 4 },
          { x: 90, y: 30 },
        ],
      ],
      closed: [false],
    },
    project = {
      ...base([o]),
      autoStart: "custom",
      startPoint: { x: 5, y: 5 },
      autoEnd: "custom",
      endPoint: { x: 20, y: 40 },
    };
  const plan = generatePlan(project);
  assert.equal(plan.issues.filter((i) => i.level === "error").length, 0);
  assert.ok(exportSVG(project).includes('viewBox="-12 0 102 50"'));
  const dst = exportDST(project, plan);
  let x = 0,
    y = 0;
  for (let i = 512; i + 2 < dst.length; i += 3) {
    if (dst[i + 2] === 0xf3) break;
    const d = decodeDSTDelta(dst[i], dst[i + 1], dst[i + 2]);
    x += d.x;
    y += d.y;
  }
  assert.equal(x, 150);
  assert.equal(y, -350);
  const first = { ...project, autoStart: "first", autoEnd: "last" },
    fplan = generatePlan(first),
    fbytes = exportDST(first, fplan);
  assert.deepEqual(decodeDSTDelta(...fbytes.slice(512, 515)), { x: 0, y: 0 });
});
await test("Machine field, origin, colour and count limits block invalid DST", () => {
  const p = base([shape("tatami")]),
    plan = generatePlan(p),
    machine = {
      name: "Test profile",
      fieldWidth: 10,
      fieldHeight: 10,
      fieldCheck: true,
      maxStitches: 350000,
      maxColors: 999,
    };
  assert.throws(() => exportDST({ ...p, machine }, plan), /field/);
  assert.throws(
    () =>
      exportDST(
        { ...p, machine: { ...machine, fieldCheck: false, maxStitches: 1 } },
        plan,
      ),
    /stitch count/,
  );
  const origin = {
    ...p,
    autoStart: "custom",
    startPoint: { x: 1000, y: 0 },
    machine: { ...machine, fieldWidth: 60, fieldHeight: 50 },
  };
  assert.throws(() => exportDST(origin, generatePlan(origin)), /field/);
});
await test("DST import preserves physical bounds and rejects truncation or specialty commands", () => {
  const p = base([shape("tatami")]),
    plan = generatePlan(p),
    bytes = exportDST(p, plan),
    imported = importDST(bytes, "proof.dst"),
    again = generatePlan(imported);
  assert.ok(imported.notes.some((n) => n.includes("placeholders")));
  assert.ok(
    Math.abs(
      again.bounds.maxX -
        again.bounds.minX -
        (plan.bounds.maxX - plan.bounds.minX),
    ) < 0.11,
  );
  assert.throws(() => importDST(bytes.slice(0, -3), "broken.dst"), /truncated/);
  const special = bytes.slice();
  special[514] = 0x43;
  assert.throws(() => importDST(special, "special.dst"), /specialty/);
});
await test("Perceptual trace retains tiny holes and exact near-identical palette shades", () => {
  const w = 20,
    h = 20,
    pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) pixels.set([17, 17, 17, 255], i * 4);
  pixels.set([255, 255, 255, 255], (10 * w + 10) * 4);
  pixels.set([18, 18, 18, 255], (2 * w + 2) * 4);
  const traced = tracePixels(
    pixels,
    w,
    h,
    {
      colors: 2,
      resolution: 20,
      minArea: 0,
      removeWhite: true,
      widthMM: 20,
      preserveHoles: true,
      simplifyMM: 0.03,
      backgroundMode: "all-white",
      palette: ["#111111", "#121212"],
    },
    "exact.png",
  );
  assert.deepEqual(
    new Set(traced.objects.map((o) => o.color)),
    new Set(["#111111", "#121212"]),
  );
  assert.ok(traced.objects.every((o) => o.colorLocked));
  const main = traced.objects.find((o) => o.color === "#111111");
  assert.equal(inside({ x: 10.5, y: 10.5 }, main.paths, "evenodd"), false);
  const filtered = tracePixels(
    pixels,
    w,
    h,
    {
      colors: 1,
      resolution: 20,
      minArea: 3,
      removeWhite: true,
      widthMM: 20,
      preserveHoles: true,
      simplifyMM: 0,
      backgroundMode: "all-white",
    },
    "hole.png",
  );
  assert.equal(
    inside({ x: 10.5, y: 10.5 }, filtered.objects[0].paths, "evenodd"),
    false,
  );
});
await test("Centreline tracing produces open paths for strokes without inventing fill", () => {
  const w = 32,
    h = 32,
    pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 4; y < 28; y++)
    for (let x = 14; x < 18; x++) pixels.set([0, 0, 0, 255], (y * w + x) * 4);
  const p = tracePixels(
    pixels,
    w,
    h,
    {
      colors: 1,
      resolution: 32,
      minArea: 0,
      removeWhite: false,
      widthMM: 32,
      mode: "centerline",
    },
    "line.png",
  );
  assert.ok(
    p.objects.every((o) => o.type === "run" && o.closed.every((v) => !v)),
  );
  assert.ok(p.objects[0].paths[0].length >= 2);
  assert.ok(generatePlan(p).stitchCount > 4);
});
await test("Thread CSV and GPL preserve shade metadata, quoted names and exact RGB", () => {
  const { importThreadLibrary, exportThreadLibrary, mergeThreadLibraries } =
    get("threads");
  const a = importThreadLibrary(
    'brand,line,code,name,hex\r\nMadeira,User chart,1000,"Black, deep",#010203',
  );
  assert.equal(a[0].code, "1000");
  assert.equal(a[0].name, "Black, deep");
  assert.deepEqual(importThreadLibrary(exportThreadLibrary(a)), a);
  const b = importThreadLibrary(
    "GIMP Palette\nName: User chart\n  12 34 56  Shade-12 Blue",
    "My-chart.gpl",
  );
  assert.equal(b[0].color, "#0c2238");
  assert.equal(mergeThreadLibraries(a, a).length, 1);
  assert.throws(
    () => importThreadLibrary("brand,color\nCustom,#xx0000"),
    /hex/,
  );
});
await test("All new project settings survive validation; invalid patterns are rejected", () => {
  const p = {
    ...base([
      {
        ...shape("program-split"),
        customPattern: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        ],
        splitPattern: "custom",
        edgeEffect: "feather",
        effectDepth: 0.8,
        repeatCount: 3,
        connector: "trim",
        thread: {
          brand: "Custom",
          line: "Studio",
          code: "J",
          name: "Jade",
          color: "#21776a",
        },
      },
    ]),
    autoStart: "custom",
    startPoint: { x: 10, y: 10 },
    autoEnd: "start",
    approval: {
      client: "Test",
      reference: "P-01",
      preparedBy: "Designer",
      notes: "Approval",
    },
    threadLibrary: [],
  };
  assert.deepEqual(validateProject(p), p);
  assert.throws(
    () =>
      validateProject({
        ...p,
        objects: [
          {
            ...p.objects[0],
            customPattern: [
              [
                { x: -1, y: 0 },
                { x: 1, y: 1 },
              ],
            ],
          },
        ],
      }),
    /coordinates/,
  );
});
await test("Approval PDF paginates sequence tables and includes physical-size template pages", async () => {
  const { createApprovalPDF } = get("approval-pdf"),
    { PDFDocument } = require("pdf-lib"),
    fonts = {
      regular: readFileSync("public/fonts/DejaVuSans.ttf"),
      bold: readFileSync("public/fonts/DejaVuSans-Bold.ttf"),
    };
  const p = {
    ...base([
      shape("tatami"),
      {
        ...shape("run"),
        id: "line",
        color: "#bd9758",
        thread: {
          brand: "Custom",
          line: "Studio",
          code: "GOLD-1",
          name: "Warm gold",
          color: "#bd9758",
        },
      },
    ]),
    name: "DSYN House - Botanical Study",
    approval: {
      client: "Sample client",
      reference: "DSYN-004",
      preparedBy: "DSYN House",
      notes:
        "Check the gold outline against the physical thread card.\nPlacement is centred on the panel.",
    },
  };
  const plan = generatePlan(p),
    data = await createApprovalPDF(
      p,
      plan,
      { paper: "a4", view: "stitches", actualSize: true, date: "2026-09-07" },
      fonts,
    ),
    doc = await PDFDocument.load(data);
  assert.ok(doc.getPageCount() >= 4);
  assert.equal(doc.getTitle(), p.name + " - Embroidery approval");
  writeFileSync(
    resolve(process.argv[2] ?? "/tmp/threadform-approval-check.pdf"),
    data,
  );
  const long = {
    ...p,
    objects: Array.from({ length: 55 }, (_, i) => ({
      ...shape("run"),
      id: `o${i}`,
      name: `Sewing pass ${i + 1}`,
    })),
  };
  const report = await PDFDocument.load(
    await createApprovalPDF(
      long,
      generatePlan(long),
      { paper: "letter", view: "artwork" },
      fonts,
    ),
  );
  assert.ok(report.getPageCount() >= 6);
});
console.log(`${count} digitizing checks passed.`);
