import { SPECIAL_FILLS, specialtyPaths } from "./specialty";
import { bounds, distance, inside, lerp, resample, rotate } from "./geometry";
import { offsetPolygons } from "./polygons";
import { outlinePaths } from "./operations";
import type { EmbroideryObject, Point } from "./types";
import { centrelineRails } from "./digitizing";
import {
  EFFECT_RUNS,
  EFFECT_FILLS,
  effectRun,
  effectFill,
  motifTile,
} from "./effects";
export type StitchProgram = {
  points: Point[];
  underlay?: boolean;
  maxLength: number;
};
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

/** Clip each segment against every contour. Test interval interiors using the original fill rule. */
export function clipPolyline(
  points: Point[],
  paths: Point[][],
  rule: "evenodd" | "nonzero",
): Point[][] {
  const result: Point[][] = [];
  let current: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      ab = { x: b.x - a.x, y: b.y - a.y },
      values = [0, 1];
    for (const path of paths)
      for (let j = 0; j < path.length; j++) {
        const c = path[j],
          d = path[(j + 1) % path.length],
          cd = { x: d.x - c.x, y: d.y - c.y },
          denominator = cross(ab, cd);
        if (Math.abs(denominator) < 1e-10) continue;
        const ca = { x: c.x - a.x, y: c.y - a.y },
          t = cross(ca, cd) / denominator,
          u = cross(ca, ab) / denominator;
        if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9)
          values.push(t);
      }
    values.sort((x, y) => x - y);
    for (let j = 1; j < values.length; j++) {
      if (values[j] - values[j - 1] < 1e-9) continue;
      const from = lerp(a, b, values[j - 1]),
        to = lerp(a, b, values[j]);
      if (inside(lerp(from, to, 0.5), paths, rule)) {
        if (
          current.length &&
          distance(current[current.length - 1], from) > 0.001
        ) {
          result.push(current);
          current = [];
        }
        if (!current.length) current.push(from);
        current.push(to);
      } else if (current.length) {
        result.push(current);
        current = [];
      }
    }
  }
  if (current.length) result.push(current);
  return result;
}
function closedPoints(object: EmbroideryObject, index: number) {
  const path = [...object.paths[index]];
  if (
    object.closed[index] &&
    path.length &&
    distance(path[0], path[path.length - 1]) > 1e-6
  )
    path.push(path[0]);
  return path;
}
function normal(points: Point[], index: number) {
  const a = points[Math.max(0, index - 1)],
    b = points[Math.min(points.length - 1, index + 1)],
    d = distance(a, b) || 1;
  return { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
}
export function* stitchPrograms(
  object: EmbroideryObject,
): Generator<StitchProgram> {
  const { type } = object,
    maxLength = Math.max(0.4, object.length);
  if (SPECIAL_FILLS.includes(type)) {
    const paths = outlinePaths(object);
    let work = 0;
    const edges = paths.reduce((s, p) => s + p.length, 0);
    for (const path of specialtyPaths(object, paths)) {
      work += path.length * edges;
      if (work > 30000000)
        throw new Error(
          "Specialty fill clipping exceeds the detail budget. Divide the region or increase spacing.",
        );
      for (const points of clipPolyline(path, paths, object.fillRule))
        yield { points, maxLength };
    }
    return;
  }
  if (type === "column-c") {
    for (let i = 0; i < object.paths.length; i++) {
      const path = closedPoints(object, i);
      if (path.length > 1)
        yield* stitchPrograms({
          ...object,
          type: "satin-column",
          paths: centrelineRails(
            path,
            object.lineWidth ?? 3,
            object.columnOffset ?? 0,
          ),
          closed: [false, false],
        });
    }
    return;
  }
  if (EFFECT_RUNS.includes(type)) {
    for (let i = 0; i < object.paths.length; i++)
      for (const points of effectRun(object, closedPoints(object, i)))
        yield { points, maxLength };
    return;
  }
  if (EFFECT_FILLS.includes(type)) {
    const paths = outlinePaths(object);
    let work = 0;
    const edges = paths.reduce((s, p) => s + p.length, 0);
    for (const path of effectFill(object, paths)) {
      work += path.length * edges;
      if (work > 30000000)
        throw new Error(
          "Effect clipping exceeds the detail budget. Simplify the boundary or increase spacing.",
        );
      for (const points of clipPolyline(path, paths, object.fillRule))
        yield { points, maxLength };
    }
    return;
  }
  if (
    ["run", "double", "triple", "back", "manual", "zigzag", "blanket"].includes(
      type,
    )
  ) {
    for (let j = 0; j < object.paths.length; j++) {
      const source = closedPoints(object, j);
      if (source.length < 2) continue;
      const points =
        type === "manual"
          ? source
          : resample(
              source,
              ["zigzag", "blanket"].includes(type)
                ? Math.max(0.25, object.spacing)
                : maxLength,
            );
      if (["run", "manual"].includes(type))
        yield { points, maxLength: type === "manual" ? 7 : maxLength };
      else if (type === "double") {
        yield {
          points: [...points, ...points.slice(0, -1).reverse()],
          maxLength,
        };
      } else if (type === "triple") {
        const output = [points[0]];
        for (let i = 1; i < points.length; i++)
          output.push(points[i], points[i - 1], points[i]);
        yield { points: output, maxLength };
      } else if (type === "back") {
        const output = [points[1], points[0]];
        for (let i = 2; i < points.length; i++)
          output.push(points[i], points[i - 1]);
        yield { points: output, maxLength: Math.min(7, maxLength * 2) };
      } else {
        const width = object.lineWidth ?? 3,
          output: Point[] = [];
        for (let i = 0; i < points.length; i++) {
          const n = normal(points, i),
            p = points[i];
          if (type === "zigzag")
            output.push({
              x: p.x + ((n.x * width) / 2) * (i % 2 ? 1 : -1),
              y: p.y + ((n.y * width) / 2) * (i % 2 ? 1 : -1),
            });
          else {
            output.push(p, { x: p.x + n.x * width, y: p.y + n.y * width }, p);
          }
        }
        yield { points: output, maxLength: 7 };
      }
    }
    return;
  }
  if (type === "contour") {
    const contours = outlinePaths(object),
      box = bounds(contours);
    const layers = Math.ceil(
      Math.min(box.maxX - box.minX, box.maxY - box.minY) /
        2 /
        Math.max(0.2, object.spacing),
    );
    let previous: Point | null = null;
    for (let row = 0; row <= layers; row++) {
      const paths = offsetPolygons(
        contours,
        -(row + 0.5) * Math.max(0.2, object.spacing),
        object.fillRule,
      );
      if (!paths.length) break;
      if (row >= 3000)
        throw new Error(
          "Contour fill exceeds the path budget. Increase spacing or divide the region; incomplete fills cannot be exported.",
        );
      for (const path of paths) {
        let start = 0;
        if (previous)
          for (let i = 1; i < path.length; i++)
            if (distance(previous, path[i]) < distance(previous, path[start]))
              start = i;
        const points = [
          ...path.slice(start),
          ...path.slice(0, start),
          path[start],
        ];
        previous = points.at(-1)!;
        yield { points, maxLength };
      }
    }
    return;
  }
  if (type === "satin-column") {
    const [left, right] = object.paths;
    if (!left || !right || left.length !== right.length || left.length < 2)
      throw new Error(
        `${object.name}: a satin column needs at least two pairs of rail points.`,
      );
    const rungs: [Point, Point][] = [];
    for (let i = 1; i < left.length; i++) {
      const length = Math.max(
        distance(left[i - 1], left[i]),
        distance(right[i - 1], right[i]),
      );
      const steps = Math.max(
        1,
        Math.ceil(length / (Math.max(0.2, object.spacing) / 2)),
      );
      if (rungs.length + steps > 180000)
        throw new Error("Satin column is too dense. Increase row spacing.");
      for (let j = i === 1 ? 0 : 1; j <= steps; j++)
        rungs.push([
          lerp(left[i - 1], left[i], j / steps),
          lerp(right[i - 1], right[i], j / steps),
        ]);
    }
    const top = rungs.map(([a, b], i) => {
      const d = distance(a, b) || 1;
      return lerp(a, b, i % 2 ? 1 + object.pull / d : -object.pull / d);
    });
    if (object.keepLastStitch !== undefined && rungs.length) {
      const [a, b] = rungs[rungs.length - 1],
        d = distance(a, b) || 1;
      const side = object.keepLastStitch ? 1 : 0;
      const end = lerp(a, b, side ? 1 + object.pull / d : -object.pull / d);
      if ((top.length - 1) % 2 !== side) {
        if (side) top.push(end);
        else {
          top.pop();
          top[top.length - 1] = end;
        }
      }
    }
    yield {
      points: top,
      maxLength: object.satinMaxLength ?? 7,
    };
    return;
  }
  const paths = outlinePaths(object),
    angle = (object.angle * Math.PI) / 180,
    local = paths.map((path) => path.map((p) => rotate(p, -angle))),
    box = bounds(local);
  const size = object.patternSize ?? 4;
  const edgeCount = paths.reduce((n, p) => n + p.length, 0);
  const complexity =
    type === "wave"
      ? ((((box.maxX - box.minX) / Math.max(0.15, Math.min(0.5, size / 12))) *
          (box.maxY - box.minY + size * 2)) /
          Math.max(0.3, object.spacing)) *
        edgeCount
      : (((box.maxX - box.minX) * (box.maxY - box.minY)) / (size * size)) *
        edgeCount *
        12;
  if (complexity > 30000000)
    throw new Error(
      `${object.name}: this decorative fill is too complex. Simplify its contours, increase pattern size or use tatami.`,
    );
  const output = function* (points: Point[]): Generator<StitchProgram> {
    for (const clipped of clipPolyline(points, local, object.fillRule))
      yield { points: clipped.map((p) => rotate(p, angle)), maxLength };
  };
  if (type === "wave") {
    let row = 0;
    for (
      let y = box.minY - size;
      y <= box.maxY + size;
      y += Math.max(0.3, object.spacing), row++
    ) {
      const points: Point[] = [],
        step = Math.max(0.15, Math.min(0.5, size / 12));
      for (let x = box.minX; x <= box.maxX + step; x += step)
        points.push({
          x: Math.min(x, box.maxX),
          y:
            y +
            Math.sin(
              ((Math.min(x, box.maxX) - box.minX) / size) * Math.PI * 2,
            ) *
              size *
              0.18,
        });
      if (row % 2) points.reverse();
      yield* output(points);
    }
    return;
  }
  // Clip decorative segments to all contours, including holes.
  for (let y = box.minY + size / 2; y < box.maxY; y += size) {
    for (let x = box.minX + size / 2; x < box.maxX; x += size) {
      const half = size * 0.42;
      if (type === "cross") {
        yield* output([
          { x: x - half, y: y - half },
          { x: x + half, y: y + half },
        ]);
        yield* output([
          { x: x - half, y: y + half },
          { x: x + half, y: y - half },
        ]);
      } else {
        if (object.customPattern?.length) {
          for (const tile of motifTile(object))
            yield* output(
              tile.map((p) => ({
                x: x + (p.x - 0.5) * size,
                y: y + (p.y - 0.5) * size,
              })),
            );
          continue;
        }
        let points: Point[];
        if (object.motif === "chevron")
          points = [
            { x: x - half, y: y - half },
            { x, y: y + half },
            { x: x + half, y: y - half },
          ];
        else if (object.motif === "star")
          points = Array.from({ length: 11 }, (_, i) => {
            const a = (i * Math.PI) / 5 - Math.PI / 2,
              r = i % 2 ? half * 0.45 : half;
            return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
          });
        else
          points = [
            { x, y: y - half },
            { x: x + half, y },
            { x, y: y + half },
            { x: x - half, y },
            { x, y: y - half },
          ];
        yield* output(points);
      }
    }
  }
}
