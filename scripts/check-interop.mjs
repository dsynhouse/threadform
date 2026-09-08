import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Module, { createRequire } from "node:module";
const out = mkdtempSync(join(tmpdir(), "threadform-interop-"));
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
      "engine",
      "project",
      "native-export",
      "interoperability",
      "thread-matching",
      "viewport",
      "auto-digitize",
      "columns",
    ].map((n) => `lib/embroidery/${n}.ts`),
  ],
  { encoding: "utf8" },
);
assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
process.env.NODE_PATH = resolve("node_modules");
Module._initPaths();
const require = createRequire(import.meta.url),
  get = (n) => require(join(out, n + ".js"));
const { generatePlan } = get("engine"),
  { makeObject } = get("types"),
  { validateProject } = get("project"),
  { underlayLayer, objectUnderlays } = get("underlay-settings"),
  { segmentInside, distance } = get("geometry"),
  { outlinePaths, flipObject, designFingerprint } = get("operations"),
  { columnA, columnB, columnC } = get("columns"),
  { sewingInputKey } = get("sewing-input"),
  { previewThreadMatches, applyThreadMatches, rankThreads, threadKey } =
    get("thread-matching"),
  { exportNative } = get("native-export"),
  { objectExchange, exportObjectExchange } = get("interoperability"),
  { zoomAt, bindViewportNavigation } = get("viewport"),
  { autoDigitizeProject, DEFAULT_AUTO } = get("auto-digitize");
const rect = (x, y, w, h = w) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const object = (extra = {}) =>
  makeObject({
    id: "one",
    name: "QA",
    paths: [rect(5, 5, 30)],
    closed: [true],
    angle: 0,
    pull: 0,
    underlay: false,
    tieIn: false,
    tieOut: false,
    ...extra,
  });
const project = (objects) => ({
  version: 1,
  name: "Interop QA",
  width: 60,
  height: 60,
  hoopWidth: 100,
  hoopHeight: 100,
  workspaceMode: "freeform",
  fabric: "linen",
  source: "manual",
  notes: [],
  objects,
});
const shade = (code, color = "#21776a") => ({
  brand: "QA imported chart",
  line: "Polyester",
  code,
  name: code,
  color,
});
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("PASS", name);
}
function contained(o, plan) {
  const outline = outlinePaths(o);
  for (let i = 1; i < plan.stitches.length; i++)
    if (plan.stitches[i].command === "stitch")
      assert.ok(
        segmentInside(
          plan.stitches[i - 1],
          plan.stitches[i],
          outline,
          o.fillRule,
          plan.stitches[i].underlay ? 1e-6 : o.pull + 1e-6,
        ),
        `${o.type}: ${JSON.stringify(plan.stitches[i])} left the shape`,
      );
}
test("All five underlay methods preserve holes and sew before the cover", () => {
  for (const kind of ["edge", "center", "zigzag", "double-zigzag", "tatami"]) {
    const o = object({
      underlay: true,
      paths: [rect(5, 5, 30), rect(15, 15, 10)],
      closed: [true, true],
      underlays: [underlayLayer(kind)],
    });
    const plan = generatePlan(project([o]));
    contained(o, plan);
    const top = plan.stitches.findIndex(
      (s) => s.command === "stitch" && !s.underlay,
    );
    assert.ok(
      plan.stitches
        .slice(0, top)
        .some(
          (s) => s.command === "stitch" && s.underlayLayer === "underlay-1",
        ),
      kind,
    );
    assert.ok(!plan.stitches.slice(top).some((s) => s.underlay));
  }
});
test("Ordered layers keep their spacing, maximum length and enabled state", () => {
  const layers = [
    { ...underlayLayer("edge", "edge"), length: 0.5 },
    { ...underlayLayer("tatami", "fill"), length: 1.2 },
    { ...underlayLayer("zigzag", "off"), enabled: false },
  ];
  const o = object({ underlay: true, underlays: layers });
  const plan = generatePlan(project([o]));
  const ids = [
    ...new Set(
      plan.stitches
        .filter((s) => s.command === "stitch" && s.underlay)
        .map((s) => s.underlayLayer),
    ),
  ];
  assert.deepEqual(ids, ["edge", "fill"]);
  for (let i = 1; i < plan.stitches.length; i++) {
    const a = plan.stitches[i - 1],
      b = plan.stitches[i];
    if (
      b.command === "stitch" &&
      b.underlayLayer &&
      a.underlayLayer === b.underlayLayer
    )
      assert.ok(distance(a, b) <= (b.underlayLayer === "edge" ? 0.501 : 1.201));
  }
  const sparse = generatePlan(
    project([{ ...o, underlays: [{ ...layers[1], spacing: 4 }] }]),
  );
  const dense = generatePlan(
    project([{ ...o, underlays: [{ ...layers[1], spacing: 1 }] }]),
  );
  assert.ok(dense.stitchCount > sparse.stitchCount);
});
test("Underlay layers survive saves, invalidate generation and reject corrupt values", () => {
  const p = project([
    object({
      underlay: true,
      underlays: [underlayLayer("edge"), underlayLayer("tatami", "second")],
    }),
  ]);
  assert.deepEqual(
    validateProject(JSON.parse(JSON.stringify(p))).objects[0].underlays,
    p.objects[0].underlays,
  );
  const changed = {
    ...p,
    objects: [
      { ...p.objects[0], underlays: p.objects[0].underlays.slice().reverse() },
    ],
  };
  assert.notEqual(sewingInputKey(p), sewingInputKey(changed));
  assert.notEqual(designFingerprint(p), designFingerprint(changed));
  for (const invalid of [
    [underlayLayer("edge"), underlayLayer("edge")],
    [{ ...underlayLayer("tatami"), spacing: 0 }],
    [{ ...underlayLayer("edge"), length: Infinity }],
  ])
    assert.throws(
      () => validateProject(project([object({ underlays: invalid })])),
      /underlay/i,
    );
  assert.equal(objectUnderlays(object({ underlayKind: "cross" })).length, 2);
  assert.deepEqual(objectUnderlays(object({ underlays: [] })), []);
});
test("Columns A, unequal B and curved C all support edge, center and zigzag foundations", () => {
  const line = [
    { x: 5, y: 5 },
    { x: 20, y: 5 },
    { x: 25, y: 15 },
  ];
  for (const column of [
    columnA([
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 5, y: 30 },
      { x: 10, y: 30 },
    ]),
    columnB(
      [
        { x: 5, y: 5 },
        { x: 5, y: 15 },
        { x: 5, y: 30 },
      ],
      [
        { x: 10, y: 5 },
        { x: 10, y: 30 },
      ],
    ),
    columnC(line, 4),
  ])
    for (const kind of ["edge", "center", "zigzag", "double-zigzag"]) {
      const o = object({
        ...column,
        underlay: true,
        underlays: [{ ...underlayLayer(kind), inset: 0 }],
      });
      const plan = generatePlan(project([o]));
      contained(o, plan);
      assert.ok(
        plan.stitches.some((s) => s.command === "stitch" && s.underlay),
        `${column.columnKind}/${kind}`,
      );
    }
});
test("An oversized inset is reported instead of silently dropping requested underlay", () => {
  const p = generatePlan(
    project([
      object({
        underlay: true,
        underlays: [{ ...underlayLayer("edge"), inset: 100 }],
      }),
    ]),
  );
  assert.ok(p.issues.some((i) => /underlay did not fit/.test(i.message)));
  assert.ok(p.stitchCount > 0);
});
test("Maximum satin length is editable and persists for parallel and rail columns", () => {
  for (const o of [
    object({ type: "satin", paths: [rect(5, 5, 10, 25)] }),
    object({
      ...columnC(
        [
          { x: 20, y: 5 },
          { x: 20, y: 30 },
        ],
        10,
      ),
    }),
  ]) {
    const wide = { ...o, satinMaxLength: 11 };
    const plan = generatePlan(project([wide]));
    assert.ok(
      plan.stitches.some(
        (s, i) =>
          i && s.command === "stitch" && distance(s, plan.stitches[i - 1]) > 9,
      ),
    );
    assert.ok(!plan.issues.some((i) => /were split/.test(i.message)));
    assert.ok(
      generatePlan(project([o])).issues.some((i) =>
        /were split/.test(i.message),
      ),
    );
    assert.equal(
      validateProject(project([wide])).objects[0].satinMaxLength,
      11,
    );
    assert.notEqual(
      designFingerprint(project([wide])),
      designFingerprint(project([o])),
    );
  }
});
test("Mirroring Column C reflects its offset and relative underlay direction", () => {
  const o = object({
    ...columnC(
      [
        { x: 10, y: 5 },
        { x: 10, y: 25 },
      ],
      4,
      2,
    ),
    underlays: [{ ...underlayLayer("tatami"), angle: 45 }],
  });
  const mirrored = flipObject(o, "x");
  assert.equal(mirrored.columnOffset, -2);
  assert.equal(mirrored.underlays[0].angle, -45);
});
test("Auto-digitizing proposes ordered foundations and preserves customized layers", () => {
  const p = project([object({ type: "none" })]);
  const auto = autoDigitizeProject(p, DEFAULT_AUTO).project.objects[0];
  assert.deepEqual(
    auto.underlays.map((l) => l.kind),
    ["edge", "tatami"],
  );
  const custom = {
    ...p,
    objects: [{ ...p.objects[0], underlays: [underlayLayer("center")] }],
  };
  assert.deepEqual(
    autoDigitizeProject(custom, DEFAULT_AUTO).project.objects[0].underlays,
    custom.objects[0].underlays,
  );
});
test("Thread matching retains artwork RGB and protects locked and assigned objects", () => {
  const chart = [shade("one"), shade("two", "#cc2233")];
  const p = project([
    object(),
    object({ id: "locked", locked: true }),
    object({ id: "assigned", thread: chart[1] }),
  ]);
  const review = previewThreadMatches(p, chart);
  assert.deepEqual(review[0].ids, ["one"]);
  assert.equal(rankThreads("#21776a", chart)[0].delta, 0);
  const result = applyThreadMatches(p, review, {
    [review[0].color]: threadKey(chart[0]),
  });
  assert.equal(result.objects[0].color, p.objects[0].color);
  assert.equal(result.objects[0].thread.code, "one");
  assert.deepEqual(result.objects.slice(1), p.objects.slice(1));
  const stale = { ...p, objects: [{ ...p.objects[0], color: "#ffffff" }] };
  assert.equal(
    applyThreadMatches(stale, review, {
      [review[0].color]: threadKey(chart[0]),
    }).objects[0].thread,
    undefined,
  );
});
test("Different physical thread codes with identical RGB produce a thread change", () => {
  const objects = [
    object({ thread: shade("one") }),
    object({ id: "two", thread: shade("two"), paths: [rect(5, 38, 10)] }),
  ];
  const p = project(objects),
    plan = generatePlan(p);
  assert.equal(plan.colorChanges, 1);
  const same = {
    ...p,
    objects: [objects[0], { ...objects[1], thread: shade("one") }],
  };
  assert.equal(generatePlan(same).colorChanges, 0);
  assert.notEqual(sewingInputKey(p), sewingInputKey(same));
  for (const format of ["pes", "jef"]) {
    const path = join(out, `thread-change.${format}`);
    writeFileSync(path, exportNative(p, plan, format));
    const decoded = spawnSync("python3", ["tests/decode-machine.py", path], {
      encoding: "utf8",
    });
    assert.equal(decoded.status, 0, decoded.stderr);
    const data = JSON.parse(decoded.stdout);
    assert.equal(data.threads.length, 2);
    assert.notEqual(data.threads[0], data.threads[1]);
  }
});
test("Object handoff preserves source methods, rails, underlays and thread provenance", () => {
  const o = object({
    ...columnC(
      [
        { x: 5, y: 5 },
        { x: 5, y: 30 },
      ],
      4,
      1,
    ),
    underlay: true,
    underlays: [underlayLayer("center")],
    thread: shade("42"),
  });
  const p = project([o]),
    plan = generatePlan(p),
    exchange = objectExchange(p, plan);
  assert.equal(exchange.conversion.nativeEMB, false);
  assert.equal(exchange.objects[0].inputMethod, "C");
  assert.equal(exchange.objects[0].coverMethod, "satin");
  assert.deepEqual(exchange.objects[0].parameters, o);
  assert.ok(
    exchange.objects[0].commandRanges.some(
      (r) => r.kind === "underlay:underlay-1",
    ),
  );
  const zip = exportObjectExchange(p, plan);
  assert.equal(
    new DataView(zip.buffer, zip.byteOffset).getUint32(0, true),
    0x04034b50,
  );
  assert.ok(new TextDecoder().decode(zip).includes("object-map.json"));
});
test("Zoom keeps the artwork point under the pointer at extreme and normal scales", () => {
  for (const fit of [0.0002, 2, 12])
    for (const zoom of [0.05, 1, 4]) {
      const view = {
        fit,
        zoom,
        pan: { x: 30, y: -25 },
        cx: 25,
        cy: 30,
        x: 500 - 25 * fit * zoom + 30,
        y: 400 - 30 * fit * zoom - 25,
      };
      const anchor = { x: 317, y: 269 },
        next = zoomAt(view, anchor, 1.25);
      const before = {
        x: (anchor.x - view.x) / (fit * zoom),
        y: (anchor.y - view.y) / (fit * zoom),
      };
      const after = {
        x:
          (anchor.x - (500 - 25 * fit * next.zoom + next.pan.x)) /
          (fit * next.zoom),
        y:
          (anchor.y - (400 - 30 * fit * next.zoom + next.pan.y)) /
          (fit * next.zoom),
      };
      assert.ok(Math.abs(before.x - after.x) < 1e-6);
      assert.ok(Math.abs(before.y - after.y) < 1e-6);
    }
});
test("Native canvas listeners cancel page pinch, pan wheels and clean up on unmount", () => {
  class Canvas extends EventTarget {
    clientHeight = 600;
    registrations = [];
    getBoundingClientRect() {
      return { left: 0, top: 0 };
    }
    addEventListener(type, listener, options) {
      this.registrations.push({ type, options });
      super.addEventListener(type, listener, options);
    }
  }
  const node = new Canvas(),
    view = { zoom: 1, fit: 2, pan: { x: 0, y: 0 }, x: 0, y: 0, cx: 0, cy: 0 };
  let result;
  const cleanup = bindViewportNavigation(
    node,
    () => view,
    (next) => {
      result = next;
    },
  );
  function event(type, props) {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, props);
    node.dispatchEvent(e);
    return e;
  }
  assert.ok(node.registrations.every((r) => r.options.passive === false));
  assert.ok(
    event("wheel", {
      ctrlKey: true,
      deltaY: -10,
      deltaX: 0,
      deltaMode: 0,
      clientX: 100,
      clientY: 100,
    }).defaultPrevented,
  );
  assert.ok(result.zoom > 1);
  event("wheel", { deltaX: 20, deltaY: 30, deltaMode: 0 });
  assert.deepEqual(result.pan, { x: -20, y: -30 });
  event("gesturestart", { scale: 1 });
  assert.ok(
    event("gesturechange", { scale: 1.5, clientX: 100, clientY: 100 })
      .defaultPrevented,
  );
  assert.equal(result.zoom, 1.5);
  const previous = result;
  event("wheel", { ctrlKey: true, deltaY: -10, deltaMode: 0 });
  assert.equal(result, previous);
  event("gestureend", {});
  cleanup();
  assert.equal(
    event("wheel", { ctrlKey: true, deltaY: -10 }).defaultPrevented,
    false,
  );
});
rmSync(out, { recursive: true, force: true });
console.log(`${passed} interoperability and navigation checks passed.`);
