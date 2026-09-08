import ClipperLib from "clipper-lib";
import { bounds, distance, signedArea } from "./geometry";
import { outlinePaths, separateElements } from "./operations";
import { curvePaths } from "./reshape";
import { LINE_TYPES, type EmbroideryObject, type Point } from "./types";

// Integer clipping at 1 μm resolution. Project coordinates are bounded to ±10 m.
// Normalize each operand separately so SVG winding rules survive Boolean edits.
const SCALE = 1000;
const toInt = (paths: Point[][]) =>
  paths.map((path) =>
    path.map((p) => ({
      X: Math.round(p.x * SCALE),
      Y: Math.round(p.y * SCALE),
    })),
  );
const fromInt = (paths: ClipperLib.Paths): Point[][] =>
  paths.map((path) => path.map((p) => ({ x: p.X / SCALE, y: p.Y / SCALE })));
export type BooleanOperation = "union" | "difference" | "intersection" | "xor";
const operations = {
  union: ClipperLib.ClipType.ctUnion,
  difference: ClipperLib.ClipType.ctDifference,
  intersection: ClipperLib.ClipType.ctIntersection,
  xor: ClipperLib.ClipType.ctXor,
};

function execute(
  subject: Point[][],
  clip: Point[][],
  operation: BooleanOperation,
  rule: "evenodd" | "nonzero" = "nonzero",
) {
  const engine = new ClipperLib.Clipper();
  engine.StrictlySimple = true;
  engine.AddPaths(toInt(subject), ClipperLib.PolyType.ptSubject, true);
  if (clip.length)
    engine.AddPaths(toInt(clip), ClipperLib.PolyType.ptClip, true);
  const output: ClipperLib.Paths = [];
  const fill =
    rule === "evenodd"
      ? ClipperLib.PolyFillType.pftEvenOdd
      : ClipperLib.PolyFillType.pftNonZero;
  if (
    !engine.Execute(
      operations[operation],
      output,
      fill,
      ClipperLib.PolyFillType.pftNonZero,
    )
  ) {
    if (!subject.length) return [];
    throw new Error("The shape operation could not resolve these contours.");
  }
  return fromInt(output).filter(
    (path) => path.length >= 3 && Math.abs(signedArea(path)) >= 0.00001,
  );
}

export function normalizePolygons(
  paths: Point[][],
  rule: "evenodd" | "nonzero" = "evenodd",
) {
  return paths.length ? execute(paths, [], "union", rule) : [];
}
/** Inputs and output use normalized nonzero winding (shells and holes opposite). */
export function booleanPolygons(
  subject: Point[][],
  clip: Point[][],
  operation: BooleanOperation,
) {
  if (!subject.length)
    return operation === "union" || operation === "xor" ? clip : [];
  if (!clip.length) return operation === "intersection" ? [] : subject;
  return execute(subject, clip, operation);
}
export function offsetPolygons(
  paths: Point[][],
  amount: number,
  rule: "evenodd" | "nonzero" = "nonzero",
): Point[][] {
  const normalized = normalizePolygons(paths, rule);
  if (!normalized.length || Math.abs(amount) < 0.0005) return normalized;
  const offset = new ClipperLib.ClipperOffset(2, 0.025 * SCALE);
  offset.AddPaths(
    toInt(normalized),
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon,
  );
  const result: ClipperLib.Paths = [];
  offset.Execute(result, amount * SCALE);
  return fromInt(result);
}
export function strokePolygons(path: Point[], radius: number): Point[][] {
  if (path.length < 2 || radius <= 0) return [];
  const offset = new ClipperLib.ClipperOffset(2, 0.025 * SCALE);
  offset.AddPath(
    toInt([path])[0],
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etOpenRound,
  );
  const result: ClipperLib.Paths = [];
  offset.Execute(result, radius * SCALE);
  return fromInt(result);
}
export function filledObject(object: EmbroideryObject) {
  return (
    ["satin-column", "column-c"].includes(object.type) ||
    (!LINE_TYPES.includes(object.type) && object.closed.every(Boolean))
  );
}
export function objectPolygons(object: EmbroideryObject) {
  if (!filledObject(object))
    throw new Error(
      "This action needs closed filled shapes. Use Knife to split a running path.",
    );
  return normalizePolygons(outlinePaths(object), object.fillRule);
}
export function polygonArea(paths: Point[][]) {
  return Math.abs(paths.reduce((sum, path) => sum + signedArea(path), 0));
}
export function polygonObjects(
  object: EmbroideryObject,
  paths: Point[][],
  suffix: string,
): EmbroideryObject[] {
  if (!paths.length) return [];
  // Cutting a rail-defined column changes its topology. Use a parallel satin
  // object until the artist draws new paired rails; never invent correspondence.
  const shape = {
    ...object,
    paths,
    closed: paths.map(() => true),
    fillRule: "nonzero" as const,
    type: ["satin-column", "column-c"].includes(object.type)
      ? ("satin" as const)
      : object.type,
  };
  return separateElements(shape).map((part, i) => ({
    ...part,
    id: `${object.id.slice(0, 55)}-${suffix}-${i}`,
    name: `${object.name} · ${suffix} ${i + 1}`.slice(0, 100),
  }));
}

/** A straight, infinite knife line; each half is clipped with exact winding. */
export function knifeObject(
  object: EmbroideryObject,
  start: Point,
  end: Point,
): EmbroideryObject[] {
  if (distance(start, end) < 0.1) return [object];
  const d = distance(start, end),
    axis = { x: (end.x - start.x) / d, y: (end.y - start.y) / d };
  const side = (p: Point) =>
    (p.x - start.x) * axis.y - (p.y - start.y) * axis.x;
  if (!filledObject(object)) {
    const fragments: Point[][] = [];
    curvePaths(object).forEach((raw, index) => {
      const path = object.closed[index] ? [...raw, raw[0]] : raw;
      if (path.length < 2) return;
      let current = [path[0]];
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          sa = side(a),
          sb = side(b);
        if (sa * sb < -1e-10) {
          const t = sa / (sa - sb),
            point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          current.push(point);
          fragments.push(current);
          current = [point];
        } else if (i > 1 && Math.abs(sa) < 1e-7 && side(path[i - 2]) * sb < 0) {
          fragments.push(current);
          current = [a];
        }
        current.push(b);
      }
      if (current.length > 1) fragments.push(current);
    });
    if (fragments.length <= object.paths.length) return [object];
    return fragments.map((path, i) => ({
      ...object,
      id: `${object.id.slice(0, 60)}-cut-${i}`,
      name: `${object.name} · cut ${i + 1}`.slice(0, 100),
      paths: [path],
      closed: [false],
    }));
  }
  const paths = objectPolygons(object),
    box = bounds(paths);
  const reach =
    Math.max(
      ...[box.minX, box.maxX].flatMap((x) =>
        [box.minY, box.maxY].map((y) => distance(start, { x, y })),
      ),
    ) + 10;
  const plane = (sign: number) => {
    const a = { x: start.x - axis.x * reach, y: start.y - axis.y * reach },
      b = { x: start.x + axis.x * reach, y: start.y + axis.y * reach };
    const nx = -axis.y * reach * 2 * sign,
      ny = axis.x * reach * 2 * sign;
    return normalizePolygons([
      [a, b, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }],
    ]);
  };
  const left = booleanPolygons(paths, plane(1), "intersection"),
    right = booleanPolygons(paths, plane(-1), "intersection");
  if (!left.length || !right.length) return [object];
  return [
    ...polygonObjects(object, left, "cut-a"),
    ...polygonObjects(object, right, "cut-b"),
  ];
}
