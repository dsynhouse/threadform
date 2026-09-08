import { digitizeCurve, reverseCurve } from "./digitizing";
import { distance } from "./geometry";
import type { EmbroideryObject, Point } from "./types";

/** Continue geometry without replacing the object's stitch and thread settings. */
export function continueObject(
  original: EmbroideryObject,
  input: Partial<EmbroideryObject>,
  fromStart = false,
): EmbroideryObject {
  if (!input.paths) throw new Error("The continuation needs a path.");
  return {
    ...original,
    paths: fromStart ? input.paths.map(reverseCurve) : input.paths,
    closed: input.closed ?? original.closed,
    ...(input.keepLastStitch !== undefined
      ? { keepLastStitch: input.keepLastStitch }
      : {}),
    ...(original.type === "column-c"
      ? {
          lineWidth: input.lineWidth ?? original.lineWidth,
          columnOffset: input.columnOffset ?? original.columnOffset,
        }
      : {}),
    entryPoint: fromStart ? undefined : original.entryPoint,
    exitPoint: fromStart ? original.exitPoint : undefined,
  };
}

export function columnA(
  nodes: Point[],
  keepLastStitch = true,
): Partial<EmbroideryObject> {
  if (nodes.length < 4 || nodes.length % 2)
    throw new Error(
      "Column A needs two complete pairs. Add the point on the opposite edge.",
    );
  return {
    name: "Column A",
    type: "satin-column",
    columnKind: "A",
    keepLastStitch,
    paths: [
      nodes.filter((_, i) => i % 2 === 0),
      nodes.filter((_, i) => i % 2 === 1),
    ],
    closed: [false, false],
    underlayKind: "center",
  };
}
export function columnB(
  first: Point[],
  second: Point[],
  keepLastStitch = true,
): Partial<EmbroideryObject> {
  if (first.length < 2 || second.length < 2)
    throw new Error("Column B needs at least two points on each edge.");
  return {
    name: "Column B",
    type: "satin-column",
    columnKind: "B",
    keepLastStitch,
    paths: [first, second],
    closed: [false, false],
    underlayKind: "center",
  };
}
export function columnC(
  nodes: Point[],
  width = 3,
  offset = 0,
): Partial<EmbroideryObject> {
  if (nodes.length < 2) throw new Error("Draw the column centreline first.");
  if (!Number.isFinite(width) || width < 0.5 || !Number.isFinite(offset))
    throw new Error("Use a column width of at least 0.5 mm.");
  const closed = nodes.length > 3 && distance(nodes[0], nodes.at(-1)!) < 0.5;
  return {
    name: "Column C",
    type: "column-c",
    columnKind: "C",
    paths: [closed ? nodes.slice(0, -1) : nodes],
    closed: [closed],
    lineWidth: width,
    columnOffset: offset,
    underlay: true,
    underlayKind: "center",
    pull: 0.2,
  };
}
export function widthFromReferences(
  nodes: Point[],
  refs: Point[],
  fallback = 3,
): { width: number; offset: number } {
  if (!refs.length) return { width: fallback, offset: 0 };
  if (refs.length !== 2)
    throw new Error(
      "Mark two width reference points, or undo them and press Enter for the default width.",
    );
  const width = distance(refs[0], refs[1]);
  if (width < 0.5)
    throw new Error("Width reference points must be at least 0.5 mm apart.");
  let offset = 0;
  if (refs.some((p) => p.curve)) {
    const path = digitizeCurve(nodes),
      center = {
        x: (refs[0].x + refs[1].x) / 2,
        y: (refs[0].y + refs[1].y) / 2,
      };
    let best = Infinity;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        dx = b.x - a.x,
        dy = b.y - a.y,
        l = Math.hypot(dx, dy);
      if (l < 1e-8) continue;
      const t = Math.max(
        0,
        Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / (l * l)),
      );
      const q = { x: a.x + t * dx, y: a.y + t * dy },
        d = distance(center, q);
      if (d < best) {
        best = d;
        offset = ((center.x - q.x) * -dy + (center.y - q.y) * dx) / l;
      }
    }
  }
  return { width, offset };
}
