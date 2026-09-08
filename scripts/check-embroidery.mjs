import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-check-"));
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
      "types",
      "geometry",
      "samples",
      "engine",
      "svg-path",
      "raster",
      "project",
      "export",
      "design-tools",
      "lettering",
      "shape-edit",
      "optimization",
    ].map((x) => `lib/embroidery/${x}.ts`),
  ],
  { encoding: "utf8" },
);
assert.equal(compile.status, 0, compile.stdout + compile.stderr);
process.env.NODE_PATH = resolve("node_modules");
const Module = await import("node:module");
Module.default._initPaths();
const require = createRequire(import.meta.url),
  get = (name) => require(join(out, name + ".js"));
const { generatePlan } = get("engine"),
  { makeObject } = get("types"),
  { createSample } = get("samples"),
  { scanline, inside, distance, bounds } = get("geometry"),
  { parsePath, parseTransform, transformPoint } = get("svg-path"),
  { validateProject, resizeProject } = get("project"),
  { encodeDSTDelta, exportDST, exportBundle } = get("export"),
  { tracePixels } = get("raster");
let checks = 0;
function check(label, fn) {
  fn();
  checks++;
  console.log("PASS " + label);
}
const square = (x, y, w) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + w },
  { x, y: y + w },
];
const project = (objects) => ({
  version: 1,
  name: "Validation",
  width: 40,
  height: 40,
  hoopWidth: 100,
  hoopHeight: 100,
  fabric: "cotton",
  source: "manual",
  notes: [],
  objects,
});
const bit = (b, n) => (b >> n) & 1;
function decode(b) {
  return {
    x:
      81 * (bit(b[2], 2) - bit(b[2], 3)) +
      27 * (bit(b[1], 2) - bit(b[1], 3)) +
      9 * (bit(b[0], 2) - bit(b[0], 3)) +
      3 * (bit(b[1], 0) - bit(b[1], 1)) +
      bit(b[0], 0) -
      bit(b[0], 1),
    y:
      81 * (bit(b[2], 5) - bit(b[2], 4)) +
      27 * (bit(b[1], 5) - bit(b[1], 4)) +
      9 * (bit(b[0], 5) - bit(b[0], 4)) +
      3 * (bit(b[1], 7) - bit(b[1], 6)) +
      bit(b[0], 7) -
      bit(b[0], 6),
  };
}
check(
  "DST encoding: every integer displacement from -121 to +121 on both axes",
  () => {
    for (let x = -121; x <= 121; x++)
      for (let y = -121; y <= 121; y++) {
        const encoded = encodeDSTDelta(x, y),
          d = decode(encoded);
        assert.equal(d.x, x);
        assert.equal(d.y, y);
        assert.equal(encoded[2] & 0xc3, 3);
      }
    assert.throws(() => encodeDSTDelta(122, 0));
  },
);
check("Compound paths honor even-odd holes and nonzero winding", () => {
  const paths = [square(0, 0, 20), square(7, 7, 6)];
  assert.deepEqual(scanline(paths, 10, "evenodd"), [
    [0, 7],
    [13, 20],
  ]);
  assert.deepEqual(scanline(paths, 10, "nonzero"), [[0, 20]]);
  assert.deepEqual(
    scanline([paths[0], [...paths[1]].reverse()], 10, "nonzero"),
    [
      [0, 7],
      [13, 20],
    ],
  );
});
check("Fill, underlay and travel do not sew across a hole", () => {
  const o = makeObject({
    id: "hole",
    name: "Hole",
    paths: [square(0, 0, 20), square(7, 7, 6)],
    angle: 0,
    spacing: 0.5,
    pull: 0,
    underlay: true,
  });
  const p = generatePlan(project([o]));
  for (let i = 1; i < p.stitches.length; i++) {
    const a = p.stitches[i - 1],
      b = p.stitches[i];
    if (b.command !== "stitch") continue;
    for (let t = 0.1; t < 1; t += 0.1) {
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      assert.ok(
        !(q.x > 7.01 && q.x < 12.99 && q.y > 7.01 && q.y < 12.99),
        "needle path crosses empty hole",
      );
    }
    assert.ok(distance(a, b) <= 3.001);
  }
  assert.ok(p.stitchCount > 50);
});
check("Satin splits long spans and flags them for review", () => {
  const p = generatePlan(
    project([
      makeObject({
        id: "s",
        name: "Satin",
        paths: [square(5, 5, 20)],
        type: "satin",
        angle: 0,
        underlay: false,
        pull: 0,
      }),
    ]),
  );
  assert.ok(p.issues.some((x) => /split/.test(x.message)));
  for (let i = 1; i < p.stitches.length; i++)
    if (p.stitches[i].command === "stitch")
      assert.ok(distance(p.stitches[i - 1], p.stitches[i]) <= 7.001);
});
check("Invisible and unstitched objects produce no needle paths", () => {
  const p = generatePlan(
    project([
      makeObject({
        id: "a",
        name: "Hidden",
        paths: [square(0, 0, 20)],
        visible: false,
      }),
      makeObject({
        id: "b",
        name: "Fabric",
        paths: [square(0, 0, 20)],
        type: "none",
      }),
    ]),
  );
  assert.equal(p.stitchCount, 0);
  assert.throws(() => exportDST(project([]), p));
});
check("Hoop overflow blocks machine export", () => {
  const p = project([
    makeObject({ id: "a", name: "Large", paths: [square(0, 0, 40)] }),
  ]);
  p.hoopWidth = 20;
  p.hoopHeight = 20;
  const plan = generatePlan(p);
  assert.ok(plan.issues.some((x) => x.level === "error"));
  assert.throws(() => exportDST(p, plan));
});
check("SVG path parser handles relative subpaths, Béziers and arcs", () => {
  const p = parsePath(
    "M 0 0 c 0 10 10 10 10 0 s 10 -10 10 0 q 5 10 10 0 t 10 0 a 5 5 0 0 1 10 0 z m 5 5 h 5 v 5 h -5 z",
  );
  assert.equal(p.paths.length, 2);
  assert.ok(p.closed.every(Boolean));
  assert.deepEqual(p.paths[1][0], { x: 5, y: 5 });
  assert.ok(p.paths[0].length > 20);
  const c = parsePath("M 0 0 C 333 .5 666 .5 1000 0", 0.06);
  assert.ok(c.paths[0].length > 2);
  const a = parsePath("M 10 0 A 10 10 0 1 1 -10 0 A 10 10 0 1 1 10 0 Z");
  const b = bounds(a.paths);
  assert.ok(Math.abs(b.maxY - 10) < 0.15 && Math.abs(b.minY + 10) < 0.15);
  assert.throws(() => parsePath("M 0 0 C 1"));
});
check("SVG matrix order and unit-preserving resize", () => {
  assert.deepEqual(
    transformPoint({ x: 2, y: 3 }, parseTransform("translate(10 20) scale(2)")),
    { x: 14, y: 26 },
  );
  const p = createSample();
  const large = resizeProject(p, 320, 320);
  assert.ok(
    Math.abs(large.objects[0].paths[0][0].x - p.objects[0].paths[0][0].x * 2) <
      1e-9,
  );
  assert.equal(large.objects[0].spacing, p.objects[0].spacing);
});
check(
  "Editable samples round-trip with settings and reject malformed projects",
  () => {
    for (const kind of ["arcs", "sampler"]) {
      const p = createSample(kind);
      assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
    }
    assert.throws(() => validateProject({ ...createSample(), width: NaN }));
    assert.throws(() =>
      validateProject({
        ...createSample(),
        objects: [
          {
            ...createSample().objects[0],
            color: "url(https://example.invalid)",
          },
        ],
      }),
    );
  },
);
check(
  "Raster tracing preserves a white hole when minimum area permits it",
  () => {
    const w = 24,
      h = 24,
      pixels = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 2; y < 22; y++)
      for (let x = 2; x < 22; x++) {
        if (x >= 8 && x < 16 && y >= 8 && y < 16) continue;
        const i = (y * w + x) * 4;
        pixels[i] = 28;
        pixels[i + 1] = 105;
        pixels[i + 2] = 80;
      }
    const p = tracePixels(
      pixels,
      w,
      h,
      {
        colors: 2,
        resolution: 256,
        minArea: 1,
        removeWhite: true,
        backgroundMode: "all-white",
        widthMM: 24,
      },
      "test.png",
    );
    assert.equal(p.objects.length, 1);
    assert.equal(p.objects[0].paths.length, 2);
    assert.ok(inside({ x: 5, y: 5 }, p.objects[0].paths));
    assert.ok(!inside({ x: 12, y: 12 }, p.objects[0].paths));
  },
);
check(
  "Sewn output contains consistent DST header, commands, colour changes and endpoint",
  () => {
    const p = createSample(),
      plan = generatePlan(p),
      dst = exportDST(p, plan);
    assert.equal((dst.length - 512) % 3, 0);
    assert.equal(dst[dst.length - 1], 0xf3);
    let x = 0,
      y = 0,
      colours = 0;
    for (let i = 512; i < dst.length - 3; i += 3) {
      const b = dst.slice(i, i + 3);
      if ((b[2] & 0xc3) === 0xc3) {
        colours++;
        continue;
      }
      const d = decode(b);
      x += d.x;
      y += d.y;
    }
    const last = plan.stitches.at(-1);
    assert.equal(x, Math.round((last.x - p.width / 2) * 10));
    assert.equal(y, Math.round((p.height / 2 - last.y) * 10));
    assert.equal(colours, plan.colorChanges);
    const header = new TextDecoder().decode(dst.slice(0, 512));
    assert.ok(header.includes("LA:Arc study"));
    assert.equal(
      Number(header.match(/ST:\s*(\d+)/)[1]),
      (dst.length - 515) / 3,
    );
    const destination = resolve(process.argv[2] || out);
    writeFileSync(join(destination, "validation.dst"), dst);
    writeFileSync(join(destination, "validation.zip"), exportBundle(p, plan));
    writeFileSync(
      join(destination, "expected.json"),
      JSON.stringify({
        stitchCount: plan.stitchCount,
        colorChanges: plan.colorChanges,
        endpoint: [x / 10, -y / 10],
        bounds: plan.bounds,
        width: p.width,
        height: p.height,
      }),
    );
    console.log(
      `Sample: ${plan.stitchCount} stitches, ${plan.colorChanges} colour changes, ${plan.trimCount} trims. Validation files: ${destination}`,
    );
  },
);
console.log(`${checks} embroidery checks passed.`);
const { stitchPrograms, clipPolyline } = get("stitch-programs");
const { separateElements, outlinePaths, designFingerprint } = get("operations");
check("Triple running stitches traverse each segment three times", () => {
  const source = makeObject({
    id: "run",
    name: "Run",
    paths: [
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
      ],
    ],
    closed: [false],
    type: "run",
    length: 3,
    underlay: false,
    tieIn: false,
    tieOut: false,
  });
  const run = generatePlan(project([source])),
    triple = generatePlan(project([{ ...source, type: "triple" }]));
  assert.equal(triple.stitchCount, run.stitchCount * 3);
});
check("Backstitch travels two segments forward and one back", () => {
  const o = makeObject({
    id: "b",
    name: "Backstitch",
    paths: [
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
      ],
    ],
    closed: [false],
    type: "back",
    length: 3,
    underlay: false,
  });
  assert.deepEqual(
    [...stitchPrograms(o)][0].points.map((p) => p.x),
    [3, 0, 6, 3, 9, 6, 12, 9],
  );
});
check("Zigzag and blanket use physical outline widths", () => {
  const o = makeObject({
    id: "z",
    name: "Outline",
    paths: [
      [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
      ],
    ],
    closed: [false],
    type: "zigzag",
    lineWidth: 4,
    spacing: 0.5,
  });
  const z = [...stitchPrograms(o)][0].points;
  assert.equal(Math.min(...z.map((p) => p.y)), -2);
  assert.equal(Math.max(...z.map((p) => p.y)), 2);
  const e = [...stitchPrograms({ ...o, type: "blanket" })][0].points;
  assert.equal(Math.min(...e.map((p) => p.y)), 0);
  assert.equal(Math.max(...e.map((p) => p.y)), 4);
});
check(
  "Turning satin follows paired rails, respects width limits and stays within its column",
  () => {
    const o = makeObject({
      id: "column",
      name: "Column",
      type: "satin-column",
      paths: [
        [
          { x: 5, y: 5 },
          { x: 5, y: 15 },
          { x: 15, y: 25 },
        ],
        [
          { x: 8, y: 5 },
          { x: 8, y: 14 },
          { x: 18, y: 22 },
        ],
      ],
      closed: [false, false],
      underlay: true,
      underlayKind: "center",
      pull: 0,
    });
    const p = generatePlan(project([o]));
    assert.ok(p.stitchCount > 50);
    for (let i = 1; i < p.stitches.length; i++) {
      const a = p.stitches[i - 1],
        b = p.stitches[i];
      if (b.command !== "stitch") continue;
      assert.ok(distance(a, b) <= 7.001);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      assert.ok(
        inside(mid, outlinePaths(o), "evenodd") || distance(a, b) < 0.01,
        "satin segment leaves its column",
      );
    }
    assert.throws(() =>
      validateProject(
        project([{ ...o, paths: [o.paths[0], o.paths[1].slice(1)] }]),
      ),
    );
  },
);
check(
  "Clipped decorative stitches retain holes and disconnected regions",
  () => {
    const paths = [square(0, 0, 20), square(7, 7, 6)];
    assert.deepEqual(
      clipPolyline(
        [
          { x: -2, y: 10 },
          { x: 22, y: 10 },
        ],
        paths,
        "evenodd",
      ),
      [
        [
          { x: 0, y: 10 },
          { x: 7, y: 10 },
        ],
        [
          { x: 13, y: 10 },
          { x: 20, y: 10 },
        ],
      ],
    );
    for (const type of ["wave", "motif", "cross"]) {
      const o = makeObject({
        id: type,
        name: type,
        paths,
        type,
        angle: 17,
        pull: 0,
        underlay: false,
        patternSize: 3,
      });
      const plan = generatePlan(project([o]));
      assert.ok(plan.stitchCount > 30);
      for (let i = 1; i < plan.stitches.length; i++) {
        const a = plan.stitches[i - 1],
          b = plan.stitches[i];
        if (b.command !== "stitch") continue;
        for (let t = 0.1; t < 1; t += 0.1) {
          const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          assert.ok(
            !(q.x > 7.001 && q.x < 12.999 && q.y > 7.001 && q.y < 12.999),
            type +
              " crosses a hole: " +
              JSON.stringify({
                a,
                b,
                q,
                context: plan.stitches.slice(Math.max(0, i - 3), i + 2),
              }),
          );
        }
      }
    }
  },
);
check("Separating raster elements retains nested holes and islands", () => {
  const o = makeObject({
    id: "compound",
    name: "Compound",
    paths: [
      square(0, 0, 20),
      square(4, 4, 12),
      square(7, 7, 6),
      square(30, 0, 5),
    ],
  });
  const parts = separateElements(o);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].paths.length, 2);
  assert.ok(!inside({ x: 5, y: 5 }, parts[0].paths, "evenodd"));
  assert.ok(parts.some((p) => inside({ x: 9, y: 9 }, p.paths, "evenodd")));
});
check(
  "Vector export preserves turning columns and all outline stitch types",
  () => {
    for (const type of [
      "run",
      "triple",
      "back",
      "zigzag",
      "blanket",
      "manual",
    ]) {
      const p = project([
        makeObject({
          id: type,
          name: type,
          paths: [
            [
              { x: 0, y: 0 },
              { x: 5, y: 5 },
            ],
          ],
          closed: [false],
          type,
        }),
      ]);
      assert.match(get("export").exportSVG(p), /fill="none"/);
    }
    const column = makeObject({
      id: "c",
      name: "Column",
      type: "satin-column",
      paths: [
        [
          { x: 0, y: 0 },
          { x: 0, y: 5 },
        ],
        [
          { x: 3, y: 0 },
          { x: 3, y: 5 },
        ],
      ],
      closed: [false, false],
    });
    const svg = get("export").exportSVG(project([column]));
    assert.equal((svg.match(/M /g) || []).length, 1);
    assert.match(svg, / Z/);
  },
);
check("Sew-out records cannot match a changed stitch design", () => {
  const p = createSample(),
    fingerprint = designFingerprint(p);
  assert.equal(designFingerprint({ ...p, sewOuts: [] }), fingerprint);
  assert.notEqual(
    designFingerprint({
      ...p,
      objects: p.objects.map((o, i) => (i ? o : { ...o, spacing: 0.8 })),
    }),
    fingerprint,
  );
});

check(
  "Radial and grid repeats retain editable geometry and unique identities",
  () => {
    const { repeatObjects, motifShape, smoothContour } = get("design-tools");
    const source = makeObject({
      id: "leaf",
      name: "Leaf",
      paths: motifShape("leaf", 8, { x: 10, y: 10 }),
    });
    const options = {
      layout: "radial",
      rows: 2,
      columns: 3,
      gap: 4,
      count: 6,
      radius: 12,
      rotate: true,
      mirror: false,
    };
    const repeated = repeatObjects(
      [source],
      options,
      { x: 20, y: 20 },
      "pattern",
    );
    assert.equal(repeated.length, 6);
    assert.equal(new Set(repeated.map((o) => o.id)).size, 6);
    for (const o of repeated) {
      const b = bounds(o.paths);
      assert.ok(
        Math.abs(
          distance(
            { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
            { x: 20, y: 20 },
          ) - 12,
        ) < 0.05,
      );
    }
    const grid = repeatObjects(
      [source],
      { ...options, layout: "grid" },
      { x: 20, y: 20 },
      "grid",
    );
    assert.equal(grid.length, 6);
    assert.equal(new Set(grid.map((o) => o.groupId)).size, 6);
    assert.equal(
      repeatObjects(
        [source],
        { ...options, rows: 401, columns: 1, layout: "grid" },
        { x: 0, y: 0 },
        "large",
      ).length,
      401,
    );
    assert.throws(
      () =>
        repeatObjects(
          [source],
          { ...options, rows: 1000000, columns: 1000000, layout: "grid" },
          { x: 0, y: 0 },
          "excessive",
        ),
      /budget/,
    );
    assert.ok(smoothContour(square(0, 0, 10)).length > 4);
  },
);
check(
  "Single-line lettering creates real editable strokes and validates unsupported glyphs",
  () => {
    const { createLettering } = get("lettering"),
      letters = createLettering(
        "DSYN 26",
        8,
        { x: 0, y: 0 },
        "#21776a",
        "letters",
      );
    assert.equal(letters.length, 6);
    assert.ok(
      letters.every(
        (o) =>
          o.type === "triple" &&
          o.paths.length > 0 &&
          o.closed.every((v) => !v),
      ),
    );
    assert.throws(() =>
      createLettering("字", 8, { x: 0, y: 0 }, "#21776a", "bad"),
    );
  },
);
check("DST trim movements remain within the selected hoop at an edge", () => {
  const p = project([
    makeObject({
      id: "edge",
      name: "Edge",
      paths: [
        [
          { x: 39, y: 20 },
          { x: 40, y: 20 },
        ],
      ],
      closed: [false],
      type: "run",
      length: 1,
      underlay: false,
      tieIn: false,
      tieOut: false,
      pull: 0,
    }),
  ]);
  p.hoopWidth = 40;
  p.hoopHeight = 40;
  const bytes = exportDST(p, generatePlan(p));
  let x = 0,
    y = 0;
  for (let i = 512; i < bytes.length; i += 3) {
    const record = bytes.slice(i, i + 3);
    if (record[2] === 0xf3) break;
    const d = decode(record);
    x += d.x;
    y += d.y;
    assert.ok(Math.abs(x) <= 200 && Math.abs(y) <= 200);
  }
});
check(
  "Metadata changes retain sew-out identity while thread changes invalidate it",
  () => {
    const p = createSample(),
      fingerprint = designFingerprint(p);
    assert.equal(
      designFingerprint({
        ...p,
        objects: p.objects.map((o) => ({
          ...o,
          name: "Renamed",
          locked: true,
          groupId: "group",
        })),
      }),
      fingerprint,
    );
    assert.notEqual(
      designFingerprint({
        ...p,
        objects: p.objects.map((o) => ({ ...o, color: "#123456" })),
      }),
      fingerprint,
    );
  },
);
check("One unusable object does not discard the rest of the design", () => {
  const good = makeObject({
    id: "good",
    name: "Good",
    paths: [square(5, 5, 20)],
    type: "tatami",
  });
  // A Column B rail left with a single point: the commonest half-finished
  // object, and one that fails inside curvePaths before any stitch is emitted.
  const bad = makeObject({
    id: "bad",
    name: "Bad",
    paths: [
      [{ x: 5, y: 5 }],
      [
        { x: 8, y: 5 },
        { x: 8, y: 25 },
      ],
    ],
    closed: [false, false],
    type: "satin-column",
    columnKind: "B",
    underlay: false,
  });
  const p = project([good, bad]);
  const plan = generatePlan(p);
  assert.ok(plan.stitchCount > 0, "the sound object still produced stitches");
  assert.ok(plan.blocks.some((b) => b.objectId === "good"));
  assert.ok(
    !plan.blocks.some((b) => b.objectId === "bad"),
    "the faulty object contributed no block",
  );
  assert.ok(
    plan.stitches.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)),
    "no partial command from the faulty object survived",
  );
  const failure = plan.issues.find(
    (i) => i.level === "error" && i.objectId === "bad",
  );
  assert.ok(failure, "the faulty object reported an error issue");
  assert.match(failure.message, /^Bad: /);
  // A plan carrying an error issue must still be unexportable.
  assert.throws(() => exportDST(p, plan));
});
check("A design whose objects all fail exports nothing", () => {
  const bad = makeObject({
    id: "bad",
    name: "Bad",
    paths: [
      [{ x: 1, y: 1 }],
      [
        { x: 4, y: 1 },
        { x: 4, y: 9 },
      ],
    ],
    closed: [false, false],
    type: "satin-column",
    columnKind: "B",
    underlay: false,
  });
  const p = project([bad]);
  const plan = generatePlan(p);
  assert.equal(plan.stitchCount, 0);
  assert.equal(plan.blocks.length, 0);
  assert.ok(plan.issues.some((i) => i.level === "error"));
  assert.throws(() => exportDST(p, plan));
});
console.log(`${checks} total embroidery checks passed.`);
