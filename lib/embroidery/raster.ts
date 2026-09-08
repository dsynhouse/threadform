import { makeObject, type Project, type Point } from "./types";
import { signedArea, suggestType } from "./geometry";
import { matchesPixelMask, refineContour } from "./trace-refinement";
import { colorLab, perceptualDifference } from "./optimization";
import { traceCenterlines } from "./centerline";
import { assertGeometryBudget, GEOMETRY_BUDGET } from "./complexity";
import type { TraceOptions } from "./trace-options";
export type { TraceOptions } from "./trace-options";
const hex = (rgb: number[]) =>
  "#" +
  rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const dist = (a: number[], b: number[]) =>
  a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
export function tracePixels(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  options: TraceOptions,
  name: string,
): Project {
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    w * h > 2048 * 2048 ||
    rgba.length !== w * h * 4
  )
    throw new Error("Invalid bitmap dimensions or pixel data.");
  if (
    !Number.isInteger(options.colors) ||
    options.colors < 1 ||
    options.colors > 64 ||
    !Number.isFinite(options.minArea) ||
    options.minArea < 0 ||
    !Number.isFinite(options.widthMM) ||
    options.widthMM < 1
  )
    throw new Error("Invalid trace settings.");
  const heightMM = options.widthMM * (h / w);
  if (!Number.isFinite(heightMM) || heightMM < 1)
    throw new Error(
      "Traced height must be a finite value of at least 1 mm. Adjust the artwork width.",
    );
  const fixed = options.palette?.length
    ? options.palette.map((c) => c.toLowerCase())
    : null;
  if (
    fixed &&
    (fixed.length > 64 || fixed.some((c) => !/^#[0-9a-f]{6}$/.test(c)))
  )
    throw new Error(
      "Supply up to 64 six-digit hex colours for an exact palette.",
    );
  if (
    options.mode === "centerline" &&
    (w > 768 || h > 768 || (fixed?.length ?? options.colors) > 8)
  )
    throw new Error(
      "Centreline mode supports at most 8 colours and a 768 pixel trace.",
    );
  const threshold = options.alphaThreshold ?? 128,
    white = options.whiteThreshold ?? 244;
  if (
    !Number.isFinite(threshold) ||
    threshold < 1 ||
    threshold > 255 ||
    !Number.isFinite(white) ||
    white < 0 ||
    white > 255 ||
    (options.simplifyMM !== undefined &&
      (!Number.isFinite(options.simplifyMM) ||
        options.simplifyMM < 0 ||
        options.simplifyMM > 1))
  )
    throw new Error("Invalid pixel threshold or simplification tolerance.");
  const light = (i: number) =>
    Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > white;
  const background = new Uint8Array(w * h);
  if (options.removeWhite && options.backgroundMode !== "all-white") {
    const queue = new Int32Array(w * h);
    let head = 0,
      tail = 0;
    const visit = (pixel: number) => {
      if (background[pixel]) return;
      const i = pixel * 4;
      if (rgba[i + 3] >= threshold && !light(i)) return;
      background[pixel] = 1;
      queue[tail++] = pixel;
    };
    for (let x = 0; x < w; x++) {
      visit(x);
      visit((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      visit(y * w);
      visit(y * w + w - 1);
    }
    while (head < tail) {
      const p = queue[head++],
        x = p % w,
        y = Math.floor(p / w);
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
  }
  const omit = (i: number) =>
    rgba[i + 3] < threshold ||
    (options.removeWhite &&
      (options.backgroundMode === "all-white"
        ? light(i)
        : !!background[i / 4]));
  const bucketKey = (p: number) =>
    (rgba[p] >> 3) * 1024 + (rgba[p + 1] >> 3) * 32 + (rgba[p + 2] >> 3);
  const histogram = new Map<
    number,
    { rgb: number[]; count: number; key: number }
  >();
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (omit(p)) continue;
    const key = bucketKey(p),
      entry = histogram.get(key);
    if (entry) {
      entry.count++;
      for (let j = 0; j < 3; j++) entry.rgb[j] += rgba[p + j];
    } else
      histogram.set(key, {
        rgb: [rgba[p], rgba[p + 1], rgba[p + 2]],
        count: 1,
        key,
      });
  }
  const buckets = [...histogram.values()]
    .map((x) => {
      const rgb = x.rgb.map((c) => c / x.count);
      return { ...x, rgb, lab: colorLab(hex(rgb)) };
    })
    .sort((a, b) => b.count - a.count || a.key - b.key);
  if (!buckets.length)
    throw new Error(
      "No artwork remains. Adjust the white or opacity threshold.",
    );
  const palette = fixed
    ? fixed.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)))
    : [buckets[0].rgb];
  let labs = palette.map((p) => colorLab(hex(p)));
  if (!fixed) {
    while (palette.length < Math.min(options.colors, buckets.length)) {
      let chosen = buckets[0],
        best = 0;
      for (const b of buckets) {
        const d =
          Math.min(...labs.map((p) => dist(p, b.lab))) * Math.sqrt(b.count);
        if (d > best) {
          best = d;
          chosen = b;
        }
      }
      if (!best) break;
      palette.push(chosen.rgb);
      labs.push(chosen.lab);
    }
    for (let step = 0; step < 12; step++) {
      const sums = palette.map(() => ({ rgb: [0, 0, 0], count: 0 }));
      for (const b of buckets) {
        let best = Infinity,
          k = 0;
        for (let j = 0; j < labs.length; j++) {
          const d = dist(b.lab, labs[j]);
          if (d < best) {
            best = d;
            k = j;
          }
        }
        sums[k].count += b.count;
        for (let j = 0; j < 3; j++) sums[k].rgb[j] += b.rgb[j] * b.count;
      }
      for (let j = 0; j < palette.length; j++)
        if (sums[j].count)
          palette[j] = sums[j].rgb.map((c) => c / sums[j].count);
      const next = palette.map((p) => colorLab(hex(p)));
      const movement = next.reduce((s, p, i) => s + dist(p, labs[i]), 0);
      labs = next;
      if (movement < 0.001) break;
    }
  }
  const assignment = new Map<number, number>();
  let error = 0,
    pixels = 0;
  for (const b of buckets) {
    let best = Infinity,
      k = 0;
    for (let j = 0; j < labs.length; j++) {
      const d = dist(b.lab, labs[j]);
      if (d < best) {
        best = d;
        k = j;
      }
    }
    assignment.set(b.key, k);
    error += Math.sqrt(best) * b.count;
    pixels += b.count;
  }
  const exact = new Map(fixed?.map((c, i) => [parseInt(c.slice(1), 16), i]));
  const labels = new Int16Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++)
    if (!omit(i * 4)) {
      const p = i * 4,
        key = (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2];
      labels[i] = exact.get(key) ?? assignment.get(bucketKey(p))!;
    }
  // Remove connected colour islands before boundary tracing. This preserves holes
  // owned by retained regions and cannot leave an orphan hole after island removal.
  let removed = 0,
    merged = 0,
    restored = 0;
  const seen = new Uint8Array(w * h);
  if (options.minArea > 0)
    for (let i = 0; i < labels.length; i++)
      if (labels[i] >= 0 && !seen[i]) {
        const color = labels[i],
          queue = [i];
        seen[i] = 1;
        for (let at = 0; at < queue.length; at++) {
          const n = queue[at],
            x = n % w;
          for (const next of [
            x > 0 ? n - 1 : -1,
            x < w - 1 ? n + 1 : -1,
            n - w,
            n + w,
          ])
            if (
              next >= 0 &&
              next < labels.length &&
              !seen[next] &&
              labels[next] === color
            ) {
              seen[next] = 1;
              queue.push(next);
            }
        }
        if (queue.length < options.minArea) {
          if (options.islandAction === "merge") {
            const touching = new Map<number, number>();
            for (const p of queue)
              for (const n of [
                p % w > 0 ? p - 1 : -1,
                p % w < w - 1 ? p + 1 : -1,
                p - w,
                p + w,
              ])
                if (
                  n >= 0 &&
                  n < labels.length &&
                  labels[n] >= 0 &&
                  labels[n] !== color
                )
                  touching.set(labels[n], (touching.get(labels[n]) ?? 0) + 1);
            const from = hex(palette[color]);
            const targets = [...touching]
              .map(([k, contact]) => ({
                k,
                contact,
                delta: perceptualDifference(from, hex(palette[k])),
              }))
              .filter((t) => t.delta <= 12)
              .sort((a, b) => a.delta - b.delta || b.contact - a.contact);
            if (targets[0]) {
              for (const p of queue) labels[p] = targets[0].k;
              merged++;
            }
          } else {
            removed++;
            for (const p of queue) labels[p] = -1;
          }
        }
      }
  const project: Project = {
    version: 1,
    name: name.replace(/\.[^.]+$/, ""),
    width: options.widthMM,
    height: heightMM,
    fabric: "linen",
    hoopWidth: 200,
    hoopHeight: 200,
    workspaceMode: "freeform",
    objects: [],
    notes: [],
    source: "raster",
  };
  const scale = options.widthMM / w,
    tolerance =
      options.simplifyMM === undefined
        ? 0.45
        : Math.max(0, Math.min(1, options.simplifyMM)) / scale;
  let rawPointCount = 0;
  for (let k = 0; k < palette.length; k++) {
    let paths: Point[][] = [];
    const rawPaths: Point[][] = [];
    if (options.mode === "centerline")
      paths.push(...traceCenterlines(labels, w, h, k, tolerance));
    else {
      type Edge = { to: number; dir: number };
      const edges = new Map<number, Edge[]>();
      const vertex = (x: number, y: number) => y * (w + 1) + x;
      const add = (
        x: number,
        y: number,
        xx: number,
        yy: number,
        dir: number,
      ) => {
        const a = vertex(x, y),
          e = { to: vertex(xx, yy), dir };
        const list = edges.get(a);
        if (list) list.push(e);
        else edges.set(a, [e]);
      };
      const same = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === k;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (same(x, y)) {
            if (!same(x, y - 1)) add(x, y, x + 1, y, 0);
            if (!same(x + 1, y)) add(x + 1, y, x + 1, y + 1, 1);
            if (!same(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
            if (!same(x - 1, y)) add(x, y + 1, x, y, 3);
          }
      while (edges.size) {
        const start = edges.keys().next().value as number;
        let current = start,
          previousDir = 0,
          steps = 0;
        const points: Point[] = [];
        do {
          points.push({
            x: current % (w + 1),
            y: Math.floor(current / (w + 1)),
          });
          const candidates = edges.get(current);
          if (!candidates?.length)
            throw new Error("Open bitmap boundary. Try a lower resolution.");
          let index = 0;
          if (candidates.length > 1) {
            const order = [1, 0, 3, 2];
            let priority = 5;
            for (let i = 0; i < candidates.length; i++) {
              const p = order.indexOf(
                (candidates[i].dir - previousDir + 4) % 4,
              );
              if (p < priority) {
                priority = p;
                index = i;
              }
            }
          }
          const edge = candidates.splice(index, 1)[0];
          if (!candidates.length) edges.delete(current);
          previousDir = edge.dir;
          current = edge.to;
          if (++steps > 4 * w * h)
            throw new Error("Image contour could not be traced.");
        } while (current !== start);
        const area = signedArea(points);
        if (points.length < 3) continue;
        if (
          options.preserveHoles === false &&
          area < 0 &&
          Math.abs(area) < options.minArea
        ) {
          removed++;
          continue;
        }
        rawPointCount += points.length;
        if (rawPointCount > GEOMETRY_BUDGET * 4)
          throw new Error(
            "This bitmap exceeds the contour processing budget. Choose Clean detail or a lower trace resolution.",
          );
        rawPaths.push(points);
        paths.push(refineContour(points, tolerance, !!options.smoothCurves));
      }
    }
    if (
      paths.length &&
      options.mode !== "centerline" &&
      options.preservePixels !== false &&
      options.preserveHoles !== false &&
      !matchesPixelMask(paths, labels, w, h, k)
    ) {
      paths = rawPaths;
      restored++;
    }
    if (paths.length) {
      const color = fixed?.[k] ?? hex(palette[k]);
      const o = makeObject({
        id: `trace-${k}`,
        name: `Colour ${k + 1}`,
        color,
        paths: paths.map((path) =>
          path.map((p) => ({ x: p.x * scale, y: p.y * scale })),
        ),
        closed: paths.map(() => options.mode !== "centerline"),
        colorLocked: !!fixed,
      });
      Object.assign(
        o,
        options.mode === "centerline"
          ? { type: "run", underlay: false, pull: 0 }
          : suggestType(o),
      );
      project.objects.push(o);
    }
  }
  if (!project.objects.length)
    throw new Error(
      "No trace remains. Reduce the island filter or choose region mode.",
    );
  assertGeometryBudget(project.objects);
  project.notes = [
    `Trace: ${w} × ${h} pixels; ${project.objects.length} colours; ${options.mode === "centerline" ? "skeleton centreline" : "region contours"}.`,
    fixed
      ? "Exact palette retained and protected from colour optimization."
      : `Perceptual quantization: mean bucket ΔE76 ${(error / pixels).toFixed(2)}. Screen colours are approximations.`,
    `${merged} low-contrast specks merged with a touching colour; ${restored} colour regions retained original contours to preserve pixel coverage.`,
    `${removed} small islands${options.preserveHoles === false ? " or holes" : ""} discarded. ${options.preserveHoles !== false ? "Holes preserved." : "Small-hole filter enabled."} Simplification tolerance ${(tolerance * scale).toFixed(3)} mm. Inspect narrow details at actual sewing scale.`,
  ];
  return project;
}
export async function traceImage(
  file: File,
  options: TraceOptions,
): Promise<Project> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(
    1,
    options.resolution / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * ratio)),
    h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return tracePixels(
    ctx.getImageData(0, 0, w, h).data,
    w,
    h,
    options,
    file.name,
  );
}
