import earcut, { deviation } from "earcut";
import { distance, lerp, segmentInside } from "./geometry";
import { normalizePolygons } from "./polygons";
import { separateElements } from "./operations";
import { makeObject, type Point } from "./types";

type Triangle = [number, number, number];
type Neighbor = { face: number; portal: Point };
type Mesh = {
  points: Point[];
  triangles: Triangle[];
  neighbors: Neighbor[][];
  regions: number[];
};
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const contains = (p: Point, a: Point, b: Point, c: Point) => {
  const v = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
  return !v.some((n) => n < -1e-8) || !v.some((n) => n > 1e-8);
};

/** Navigation stays inside normalized filled regions, including around holes.
 * Earcut supplies adjacency, not authority: every returned segment is checked
 * against the original contours before it can become a needle movement. */
export function createFillRouter(
  paths: Point[][],
  rule: "evenodd" | "nonzero",
) {
  let mesh: Mesh | undefined,
    work = 0;
  const edges = paths.reduce((n, p) => n + p.length, 0);
  const spend = (n: number) => {
    work += n;
    if (work > 40000000)
      throw new Error(
        "Connecting this fill exceeds the geometry budget. Simplify its contours or divide the design.",
      );
  };
  const valid = (a: Point, b: Point, tolerance: number) => {
    spend(edges);
    return segmentInside(a, b, paths, rule, tolerance);
  };
  const build = (): Mesh => {
    // Clipper resolves topology at 1 µm. Restore original vertex coordinates
    // so a rounded miter does not sit just outside its source satin boundary.
    const original = new Map<string, Point[]>();
    const key = (p: Point) =>
      `${Math.round(p.x * 1000)}:${Math.round(p.y * 1000)}`;
    for (const path of paths)
      for (const p of path) {
        const k = key(p),
          candidates = original.get(k) ?? [];
        candidates.push(p);
        original.set(k, candidates);
      }
    const normalized = normalizePolygons(paths, rule).map((path) =>
      path.map((p) => {
        const candidates = original.get(key(p));
        return (
          candidates?.reduce((best, candidate) =>
            distance(p, candidate) < distance(p, best) ? candidate : best,
          ) ?? p
        );
      }),
    );
    if (normalized.reduce((n, p) => n + p.length, 0) > 20000)
      throw new Error(
        "This fill has too many boundary points for continuous routing. Simplify its contour first.",
      );
    const regions = separateElements(
      makeObject({
        id: "routing",
        name: "Routing",
        paths: normalized,
        fillRule: "nonzero",
      }),
    );
    const points: Point[] = [],
      triangles: Triangle[] = [],
      regionIds: number[] = [];
    for (const [regionId, region] of regions.entries()) {
      const start = points.length,
        data: number[] = [],
        holes: number[] = [];
      region.paths.forEach((ring, index) => {
        if (index) holes.push(data.length / 2);
        for (const point of ring) {
          data.push(point.x, point.y);
          points.push(point);
        }
      });
      const indices = earcut(data, holes, 2);
      if (!indices.length || deviation(data, holes, 2, indices) > 1e-7)
        throw new Error(
          "The fill boundary could not be routed reliably. Repair overlapping or degenerate contours.",
        );
      for (let i = 0; i < indices.length; i += 3) {
        const triangle: Triangle = [
          start + indices[i],
          start + indices[i + 1],
          start + indices[i + 2],
        ];
        if (
          Math.abs(
            cross(
              points[triangle[0]],
              points[triangle[1]],
              points[triangle[2]],
            ),
          ) < 1e-12
        )
          continue;
        triangles.push(triangle);
        regionIds.push(regionId);
      }
    }
    const neighbors: Neighbor[][] = triangles.map(() => []),
      open = new Map<string, number>();
    triangles.forEach((triangle, face) => {
      for (let i = 0; i < 3; i++) {
        const a = triangle[i],
          b = triangle[(i + 1) % 3],
          key = a < b ? `${a}:${b}` : `${b}:${a}`;
        const previous = open.get(key);
        if (previous === undefined) open.set(key, face);
        else {
          const portal = lerp(points[a], points[b], 0.5);
          neighbors[face].push({ face: previous, portal });
          neighbors[previous].push({ face, portal });
          open.delete(key);
        }
      }
    });
    return { points, triangles, neighbors, regions: regionIds };
  };
  return (from: Point, to: Point, tolerance = 1e-6): Point[] | null => {
    if (valid(from, to, 1e-6)) return [from, to];
    mesh ??= build();
    const { points, triangles, neighbors } = mesh;
    const locate = (point: Point) => {
      let result: { face: number; point: Point } | null = null,
        nearest = tolerance + 0.001;
      spend(triangles.length * 3);
      for (let i = 0; i < triangles.length; i++) {
        const t = triangles[i];
        if (contains(point, points[t[0]], points[t[1]], points[t[2]]))
          return { face: i, point };
        for (let j = 0; j < 3; j++) {
          const a = points[t[j]],
            b = points[t[(j + 1) % 3]],
            dx = b.x - a.x,
            dy = b.y - a.y;
          const f = Math.max(
            0,
            Math.min(
              1,
              ((point.x - a.x) * dx + (point.y - a.y) * dy) /
                (dx * dx + dy * dy || 1),
            ),
          );
          const p = lerp(a, b, f),
            d = distance(point, p);
          if (d < nearest) {
            result = { face: i, point: p };
            nearest = d;
          }
        }
      }
      return result;
    };
    const a = locate(from),
      b = locate(to);
    if (!a || !b) return null;
    if (mesh.regions[a.face] !== mesh.regions[b.face]) return null;
    if (valid(a.point, b.point, 1e-6) && valid(from, to, tolerance))
      return [from, to];
    const parent = new Int32Array(triangles.length).fill(-1),
      portals: (Point | undefined)[] = [];
    parent[a.face] = a.face;
    const queue = [a.face];
    for (let i = 0; i < queue.length && parent[b.face] < 0; i++) {
      spend(3);
      for (const next of neighbors[queue[i]])
        if (parent[next.face] < 0) {
          parent[next.face] = queue[i];
          portals[next.face] = next.portal;
          queue.push(next.face);
        }
    }
    if (parent[b.face] < 0) return null; // Separate islands require a jump.
    const corridor: Point[] = [];
    for (let face = b.face; face !== a.face; face = parent[face])
      corridor.push(portals[face]!);
    const route = [from, a.point, ...corridor.reverse(), b.point, to].filter(
      (p, i, all) => !i || distance(p, all[i - 1]) > 1e-8,
    );
    const result = [route[0]];
    for (let i = 2; i < route.length; i++)
      if (!valid(result[result.length - 1], route[i], tolerance))
        result.push(route[i - 1]);
    if (route.length > 1) result.push(route[route.length - 1]);
    return result.slice(1).every((p, i) => valid(result[i], p, tolerance))
      ? result
      : null;
  };
}
