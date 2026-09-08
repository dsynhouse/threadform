import type { Point, EmbroideryObject } from "./types";
export const distance = (a: Point, b: Point) =>
  Math.hypot(b.x - a.x, b.y - a.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function bounds(paths: Point[][]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const path of paths)
    for (const p of path) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  return Number.isFinite(minX)
    ? { minX, minY, maxX, maxY }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
export function rotate(p: Point, angle: number): Point {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
export function signedArea(path: Point[]) {
  let a = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i],
      q = path[(i + 1) % path.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
export function inside(
  p: Point,
  paths: Point[][],
  rule: "evenodd" | "nonzero" = "evenodd",
) {
  let winding = 0,
    parity = false;
  for (const path of paths)
    for (let i = 0; i < path.length; i++) {
      const a = path[i],
        b = path[(i + 1) % path.length];
      if (a.y > p.y !== b.y > p.y) {
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (x > p.x) {
          parity = !parity;
          winding += b.y > a.y ? 1 : -1;
        }
      }
    }
  return rule === "evenodd" ? parity : winding !== 0;
}
/** Check all boundary-crossing intervals, including sub-pixel holes. */
export function segmentInside(
  a: Point,
  b: Point,
  paths: Point[][],
  rule: "evenodd" | "nonzero",
  tolerance = 0,
) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    values = [0, 1];
  for (const path of paths)
    for (let i = 0; i < path.length; i++) {
      const c = path[i],
        d = path[(i + 1) % path.length],
        ex = d.x - c.x,
        ey = d.y - c.y,
        denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-12) continue;
      const cx = c.x - a.x,
        cy = c.y - a.y,
        t = (cx * ey - cy * ex) / denominator,
        u = (cx * dy - cy * dx) / denominator;
      if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) values.push(t);
    }
  values.sort((x, y) => x - y);
  for (let i = 1; i < values.length; i++) {
    if (values[i] - values[i - 1] < 1e-12) continue;
    const p = lerp(a, b, (values[i] + values[i - 1]) / 2);
    if (inside(p, paths, rule)) continue;
    let near = false;
    for (const path of paths)
      for (let j = 0; j < path.length; j++) {
        const u = path[j],
          v = path[(j + 1) % path.length],
          vx = v.x - u.x,
          vy = v.y - u.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - u.x) * vx + (p.y - u.y) * vy) / (vx * vx + vy * vy || 1),
          ),
        );
        if (distance(p, lerp(u, v, t)) <= Math.max(1e-8, tolerance)) {
          near = true;
          break;
        }
      }
    if (!near) return false;
  }
  return true;
}
export function scanline(
  paths: Point[][],
  y: number,
  rule: "evenodd" | "nonzero",
) {
  const hits: { x: number; delta: number }[] = [];
  for (const path of paths)
    for (let i = 0; i < path.length; i++) {
      const a = path[i],
        b = path[(i + 1) % path.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y))
        hits.push({
          x: a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y),
          delta: b.y > a.y ? 1 : -1,
        });
    }
  hits.sort((a, b) => a.x - b.x);
  const spans: [number, number][] = [];
  let state = 0,
    start = 0;
  for (let i = 0; i < hits.length; ) {
    const x = hits[i].x;
    let delta = 0,
      count = 0;
    while (i < hits.length && Math.abs(hits[i].x - x) < 1e-8) {
      delta += hits[i].delta;
      count++;
      i++;
    }
    const wasInside = state !== 0;
    state = rule === "evenodd" ? (state + count) % 2 : state + delta;
    if (!wasInside && state !== 0) start = x;
    if (wasInside && state === 0 && x - start > 0.015) spans.push([start, x]);
  }
  return spans;
}
export function principalAngle(paths: Point[][]) {
  const pts = paths.flat();
  if (pts.length < 2) return 0;
  const mean = pts.reduce(
    (s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }),
    { x: 0, y: 0 },
  );
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of pts) {
    const x = p.x - mean.x,
      y = p.y - mean.y;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  return 0.5 * Math.atan2(2 * xy, xx - yy);
}
export function suggestType(object: EmbroideryObject) {
  if (object.closed.every((x) => !x))
    return { type: "run" as const, angle: object.angle };
  const a = principalAngle(object.paths),
    b = bounds(object.paths.map((path) => path.map((p) => rotate(p, -a))));
  const short = Math.min(b.maxX - b.minX, b.maxY - b.minY);
  return {
    type: short <= 7 ? ("satin" as const) : ("tatami" as const),
    angle: short <= 7 ? ((((a * 180) / Math.PI + 90) % 180) + 180) % 180 : 45,
  };
}
export function pathLength(points: Point[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++)
    d += distance(points[i - 1], points[i]);
  return d;
}
export function resample(points: Point[], spacing: number): Point[] {
  if (points.length < 2) return [...points];
  const result = [points[0]];
  let remain = spacing;
  for (let i = 1; i < points.length; i++) {
    let from = points[i - 1];
    const to = points[i];
    let d = distance(from, to);
    while (d >= remain && d > 1e-8) {
      from = lerp(from, to, remain / d);
      result.push(from);
      d = distance(from, to);
      remain = spacing;
    }
    remain -= d;
    if (i < points.length - 1) {
      const a = points[i - 1],
        b = points[i],
        c = points[i + 1];
      const ux = b.x - a.x,
        uy = b.y - a.y,
        vx = c.x - b.x,
        vy = c.y - b.y;
      const cosine =
        (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
      if (cosine < 0.866 && distance(result[result.length - 1], b) > 0.1) {
        result.push(b);
        remain = spacing;
      }
    }
  }
  if (distance(result[result.length - 1], points[points.length - 1]) > 0.1)
    result.push(points[points.length - 1]);
  return result;
}
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const pending: [number, number][] = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!,
      a = points[first],
      b = points[last];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      d2 = dx * dx + dy * dy;
    let maximum = epsilon,
      index = -1;
    for (let i = first + 1; i < last; i++) {
      const t = d2
        ? Math.max(
            0,
            Math.min(
              1,
              ((points[i].x - a.x) * dx + (points[i].y - a.y) * dy) / d2,
            ),
          )
        : 0;
      const d = distance(points[i], lerp(a, b, t));
      if (d > maximum) {
        maximum = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      pending.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
