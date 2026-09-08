import type { EmbroideryObject, Point } from "./types";
import {
  digitizeCurve,
  pairedCurveRails,
  pairRails,
  curveSegment,
} from "./digitizing";
import { distance } from "./geometry";
export type NodeAddress = { path: number; index: number };
export function curvePaths(o: EmbroideryObject): Point[][] {
  if (o.type === "satin-column" && o.columnKind === "B")
    return pairRails(
      digitizeCurve(o.paths[0]),
      digitizeCurve(o.paths[1]),
      true,
    );
  if (
    !o.paths.some((path) =>
      path.some((p) => p.curve || p.handleIn || p.handleOut),
    )
  )
    return o.paths;
  let estimated = 0;
  for (let j = 0; j < o.paths.length; j++) {
    const path = o.paths[j],
      count = o.closed[j] ? path.length : path.length - 1;
    for (let i = 0; i < count; i++) {
      const a = path[i],
        b = path[(i + 1) % path.length];
      estimated +=
        a.curve || b.curve || a.handleOut || b.handleIn
          ? Math.min(2000, Math.max(4, Math.ceil(distance(a, b) / 0.15)))
          : 1;
      if (estimated > 150000)
        throw new Error(
          "Curve refinement exceeds 150,000 points. Simplify the contour before smoothing.",
        );
    }
  }
  const paths =
    o.type === "satin-column"
      ? pairedCurveRails(o.paths[0].flatMap((p, i) => [p, o.paths[1][i]]))
      : o.paths.map((path, i) =>
          path.some((p) => p.curve || p.handleIn || p.handleOut)
            ? digitizeCurve(path, o.closed[i])
            : path,
        );
  if (paths.reduce((n, p) => n + p.length, 0) > 150000)
    throw new Error(
      "Curve refinement exceeds 150,000 points. Simplify the contour before smoothing.",
    );
  return paths;
}
export function editNodes(
  o: EmbroideryObject,
  nodes: NodeAddress[],
  change: (p: Point) => Point,
): EmbroideryObject {
  if (o.locked) return o;
  return {
    ...o,
    paths: o.paths.map((path, j) =>
      path.map((p, i) =>
        nodes.some((n) => n.path === j && n.index === i)
          ? (() => {
              const next = change(p),
                dx = next.x - p.x,
                dy = next.y - p.y;
              return {
                ...next,
                handleIn: next.handleIn
                  ? { x: next.handleIn.x + dx, y: next.handleIn.y + dy }
                  : undefined,
                handleOut: next.handleOut
                  ? { x: next.handleOut.x + dx, y: next.handleOut.y + dy }
                  : undefined,
              };
            })()
          : p,
      ),
    ),
  };
}
export function bezierNodes(
  o: EmbroideryObject,
  nodes: NodeAddress[],
): EmbroideryObject {
  if (o.locked) return o;
  return {
    ...o,
    paths: o.paths.map((path, j) =>
      path.map((p, i) => {
        if (
          !nodes.some((n) => n.path === j && n.index === i) ||
          path.length < 2
        )
          return p;
        return {
          ...p,
          handleIn:
            i > 0 || o.closed[j]
              ? curveSegment(
                  path,
                  (i - 1 + path.length) % path.length,
                  o.closed[j],
                ).handleIn
              : { x: p.x, y: p.y },
          handleOut:
            i < path.length - 1 || o.closed[j]
              ? curveSegment(path, i, o.closed[j]).handleOut
              : { x: p.x, y: p.y },
        };
      }),
    ),
  };
}
export function removeNodes(
  o: EmbroideryObject,
  nodes: NodeAddress[],
): EmbroideryObject {
  if (o.locked) return o;
  const paths = o.paths.map((path, j) =>
    path.filter(
      (_, i) =>
        !nodes.some(
          (n) =>
            ((o.type === "satin-column" && o.columnKind !== "B") ||
              n.path === j) &&
            n.index === i,
        ),
    ),
  );
  if (
    paths.some(
      (p, j) => p.length < (o.type === "satin-column" || !o.closed[j] ? 2 : 3),
    )
  )
    throw new Error(
      "Keep at least three contour points or two points on each open rail.",
    );
  return { ...o, paths };
}
export function insertNode(
  o: EmbroideryObject,
  pathIndex: number,
  index: number,
  point: Point,
): EmbroideryObject {
  if (o.locked) return o;
  return {
    ...o,
    paths: o.paths.map((path, j) => {
      if (
        j !== pathIndex &&
        !(o.type === "satin-column" && o.columnKind !== "B")
      )
        return path;
      const a = path[index],
        b = path[(index + 1) % path.length];
      const next =
        j === pathIndex
          ? point
          : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, curve: point.curve };
      return [...path.slice(0, index + 1), next, ...path.slice(index + 1)];
    }),
  };
}
