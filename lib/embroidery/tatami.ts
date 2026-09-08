import { bounds, distance, lerp, scanline, segmentInside } from "./geometry";
import type { Point } from "./types";

export type FillRow = { left: number; right: number; y: number; index: number };
type Band = FillRow[];
type Span = FillRow & { band: Band; previous: Span[]; next: Span[] };

/** Split at actual region forks/merges, not at every scanline or hole. */
export function tatamiBands(
  paths: Point[][],
  rule: "evenodd" | "nonzero",
  spacing: number,
  spacingEnd?: number,
  startOffset = 0,
): Band[] {
  const box = bounds(paths),
    bands: Band[] = [];
  let previous: Span[] = [],
    count = 0,
    index = 0;
  for (let y = box.minY + spacing / 2 + startOffset; y < box.maxY; index++) {
    const current: Span[] = scanline(paths, y, rule)
      .filter(([a, b]) => b - a >= 0.12)
      .map(([left, right]) => ({
        left,
        right,
        y,
        index,
        band: [],
        previous: [],
        next: [],
      }));
    count += current.length;
    if (count > 100000 || index > 100000)
      throw new Error(
        "This fill is too complex. Simplify the contours or increase row spacing.",
      );
    // Both lists are ordered disjoint intervals: a sweep avoids quadratic matching.
    let a = 0,
      b = 0;
    while (a < previous.length && b < current.length) {
      const p = previous[a],
        c = current[b];
      if (Math.min(p.right, c.right) - Math.max(p.left, c.left) > 1e-7) {
        p.next.push(c);
        c.previous.push(p);
      }
      if (p.right < c.right) a++;
      else b++;
    }
    for (const span of current) {
      const parent = span.previous[0];
      if (span.previous.length === 1 && parent.next.length === 1)
        span.band = parent.band;
      else {
        span.band = [];
        bands.push(span.band);
      }
      // Do not retain the linking graph (which otherwise holds every previous row).
      span.band.push({ left: span.left, right: span.right, y, index });
    }
    for (const span of current) span.previous = [];
    previous = current;
    const t = Math.max(
      0,
      Math.min(1, (y - box.minY) / (box.maxY - box.minY || 1)),
    );
    y +=
      spacingEnd === undefined
        ? spacing
        : 1 / ((1 - t) / spacing + t / spacingEnd);
  }
  return bands;
}

/** Bounded nearest-band scheduling; each band is sewn as one serpentine block. */
export function* orderedTatamiRows(
  bands: Band[],
  start: Point,
  needleOnly = false,
) {
  const active = bands.slice(0, 32);
  let next = active.length,
    cursor = start;
  while (active.length) {
    let best = { slot: 0, backward: false, reverse: false, distance: Infinity };
    active.forEach((band, slot) => {
      for (const backward of [false, true])
        for (const reverse of [false, true]) {
          const row = band[backward ? band.length - 1 : 0];
          const d = distance(cursor, {
            x: reverse ? row.right : row.left,
            y: row.y,
          });
          if (d < best.distance)
            best = { slot, backward, reverse, distance: d };
        }
    });
    const band = active[best.slot];
    if (next < bands.length) active[best.slot] = bands[next++];
    else active.splice(best.slot, 1);
    for (let step = 0; step < band.length; step++) {
      const row = band[best.backward ? band.length - 1 - step : step];
      const reverse = best.reverse !== (step % 2 === 1);
      yield { row, reverse, bandStart: step === 0 };
      cursor = { x: reverse !== needleOnly ? row.left : row.right, y: row.y };
    }
  }
}

/** Needle lattice stays anchored in shape coordinates, including on reverse rows. */
export function tatamiNeedles(
  left: number,
  right: number,
  origin: number,
  row: number,
  maxLength: number,
  offset: number,
  minLength: number,
  reverse: boolean,
): number[] {
  const minimum = Math.min(minLength, maxLength / 3);
  const phase = origin + ((((row * offset) % 1) + 1) % 1) * maxLength;
  const points = [left];
  for (
    let x = phase + Math.ceil((left + minimum - phase) / maxLength) * maxLength;
    x <= right - minimum + 1e-8;
    x += maxLength
  ) {
    if (x > left + 1e-8) points.push(x);
  }
  points.push(right);
  // Removing a short edge stitch must never leave an overlength replacement.
  const result = [left];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const count = Math.max(1, Math.ceil((b - a - 1e-8) / maxLength));
    for (let j = 1; j <= count; j++) result.push(a + ((b - a) * j) / count);
  }
  return reverse ? result.reverse() : result;
}

/** Follow a shared contour when a straight connector would cut a concavity/hole. */
export function boundaryConnector(
  from: Point,
  to: Point,
  paths: Point[][],
  rule: "evenodd" | "nonzero",
  tolerance: number,
  maxLength = Math.max(8, distance(from, to) * 1.8),
): Point[] | null {
  let best: Point[] | null = null,
    bestLength = maxLength;
  for (const path of paths) {
    if (path.length < 3) continue;
    const project = (point: Point) => {
      let best = { edge: 0, t: 0, point: path[0], d: Infinity };
      for (let i = 0; i < path.length; i++) {
        const a = path[i],
          b = path[(i + 1) % path.length],
          dx = b.x - a.x,
          dy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) /
              (dx * dx + dy * dy || 1),
          ),
        );
        const p = lerp(a, b, t),
          d = distance(point, p);
        if (d < best.d) best = { edge: i, t, point: p, d };
      }
      return best;
    };
    const a = project(from),
      b = project(to);
    if (a.d > tolerance + 1e-5 || b.d > tolerance + 1e-5) continue;
    const forward = (
      a: ReturnType<typeof project>,
      b: ReturnType<typeof project>,
    ) => {
      const points = [a.point];
      if (!(a.edge === b.edge && a.t <= b.t)) {
        let edge = a.edge;
        do {
          points.push(path[(edge + 1) % path.length]);
          edge = (edge + 1) % path.length;
        } while (edge !== b.edge);
      }
      points.push(b.point);
      return points;
    };
    for (const middle of [forward(a, b), forward(b, a).reverse()]) {
      const points = [from, ...middle, to];
      const length = points
        .slice(1)
        .reduce((sum, point, i) => sum + distance(points[i], point), 0);
      if (
        length < bestLength &&
        points
          .slice(1)
          .every((p, i) => segmentInside(points[i], p, paths, rule, tolerance))
      ) {
        best = points;
        bestLength = length;
      }
    }
  }
  return best;
}
