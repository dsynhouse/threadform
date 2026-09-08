import { distance, lerp, signedArea, simplify } from "./geometry";
import type { Point } from "./types";

/** Fit within the requested physical tolerance while keeping sharp corners.
 * Pixel-mask verification is applied to the complete colour region afterwards. */
export function refineContour(
  points: Point[],
  tolerance: number,
  smooth: boolean,
) {
  if (points.length < 4 || tolerance <= 0) return points;
  const reduced = simplify([...points, points[0]], tolerance);
  if (reduced.length > 1) reduced.pop();
  if (
    reduced.length < 3 ||
    Math.sign(signedArea(reduced)) !== Math.sign(signedArea(points))
  )
    return points;
  if (!smooth) return reduced;
  const result: Point[] = [];
  for (let i = 0; i < reduced.length; i++) {
    const prev = reduced[(i + reduced.length - 1) % reduced.length],
      p = reduced[i],
      next = reduced[(i + 1) % reduced.length];
    const a = distance(prev, p),
      b = distance(p, next);
    const cosine =
      ((p.x - prev.x) * (next.x - p.x) + (p.y - prev.y) * (next.y - p.y)) /
      (a * b || 1);
    // Preserve sharp corners. Two close samples round shallow changes only;
    // needle geometry remains editable and SVG exports the same contour.
    if (cosine < 0.25 || a < 0.1 || b < 0.1) {
      result.push(p);
      continue;
    }
    const d = Math.min(tolerance * 0.45, a * 0.18, b * 0.18);
    result.push(lerp(p, prev, d / a), lerp(p, next, d / b));
  }
  return result;
}

/** Active-edge scan conversion. Exact equality at EVERY source pixel centre
 * rejects contour smoothing/simplification that loses a pixel-sized detail,
 * joins islands, fills holes or changes colour boundaries. */
export function matchesPixelMask(
  paths: Point[][],
  labels: Int16Array,
  w: number,
  h: number,
  color: number,
) {
  type Edge = { end: number; x: number; step: number };
  const starts = new Map<number, Edge[]>();
  for (const path of paths)
    for (let i = 0; i < path.length; i++) {
      let a = path[i],
        b = path[(i + 1) % path.length];
      if (a.y === b.y) continue;
      if (a.y > b.y) [a, b] = [b, a];
      const start = Math.max(0, Math.ceil(a.y - 0.5)),
        end = Math.min(h, Math.ceil(b.y - 0.5));
      if (start >= end) continue;
      const step = (b.x - a.x) / (b.y - a.y);
      const edge = { end, x: a.x + (start + 0.5 - a.y) * step, step };
      const list = starts.get(start) ?? [];
      list.push(edge);
      starts.set(start, list);
    }
  let active: Edge[] = [];
  for (let y = 0; y < h; y++) {
    active = active.filter((e) => e.end > y);
    active.push(...(starts.get(y) ?? []));
    active.sort((a, b) => a.x - b.x);
    let at = 0,
      parity = false;
    for (let x = 0; x < w; x++) {
      while (at < active.length && active[at].x <= x + 0.5) {
        parity = !parity;
        at++;
      }
      if (parity !== (labels[y * w + x] === color)) return false;
    }
    for (const edge of active) edge.x += edge.step;
  }
  return true;
}
