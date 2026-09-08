import { bounds, distance, lerp, rotate } from "./geometry";
import { centrelineRails } from "./digitizing";
import { outlinePaths } from "./operations";
import { offsetPolygons } from "./polygons";
import { clipPolyline } from "./stitch-programs";
import { tatamiBands, orderedTatamiRows, tatamiNeedles } from "./tatami";
import type { EmbroideryObject, Point, UnderlayLayer } from "./types";

import { objectUnderlays } from "./underlay-settings";

export type UnderlayProgram = {
  points: Point[];
  maxLength: number;
  layer: UnderlayLayer;
  contours: Point[][];
  rule: "evenodd" | "nonzero";
};

function columnRails(object: EmbroideryObject): [Point[], Point[]] | null {
  if (object.type === "satin-column" && object.paths.length === 2)
    return object.paths as [Point[], Point[]];
  if (object.type === "column-c" && object.paths[0]?.length > 1) {
    const path = object.closed[0]
      ? [...object.paths[0], object.paths[0][0]]
      : object.paths[0];
    return centrelineRails(
      path,
      object.lineWidth ?? 3,
      object.columnOffset ?? 0,
    ) as [Point[], Point[]];
  }
  return null;
}
export function* underlayPrograms(
  object: EmbroideryObject,
): Generator<UnderlayProgram> {
  if (!object.underlay) return;
  const outline = outlinePaths(object),
    rails = columnRails(object);
  for (const layer of objectUnderlays(object).filter((l) => l.enabled)) {
    const contours =
      layer.inset === 0
        ? outline
        : offsetPolygons(
            outline,
            -Math.max(0.002, layer.inset),
            object.fillRule,
          );
    const rule = layer.inset === 0 ? object.fillRule : "nonzero";
    if (!contours.length) continue;
    const emit = function* (points: Point[]): Generator<UnderlayProgram> {
      for (const clipped of clipPolyline(points, contours, rule))
        if (clipped.length > 1)
          yield {
            points: clipped,
            maxLength: layer.length,
            layer,
            contours,
            rule,
          };
    };
    if (layer.kind === "edge") {
      for (const path of contours)
        if (path.length > 1)
          yield {
            points: [...path, path[0]],
            maxLength: layer.length,
            layer,
            contours,
            rule,
          };
      continue;
    }
    if (
      rails &&
      (layer.kind === "center" ||
        layer.kind === "zigzag" ||
        layer.kind === "double-zigzag")
    ) {
      const [left, right] = rails;
      if (layer.kind === "center") {
        yield* emit(left.map((p, i) => lerp(p, right[i], 0.5)));
        continue;
      }
      const rungs: [Point, Point][] = [];
      for (let i = 1; i < left.length; i++) {
        const count = Math.max(
          1,
          Math.ceil(
            Math.max(
              distance(left[i - 1], left[i]),
              distance(right[i - 1], right[i]),
            ) /
              (layer.spacing / 2),
          ),
        );
        if (rungs.length + count > 350000)
          throw new Error(
            "This underlay exceeds the interactive geometry budget. Increase its spacing or generate smaller sewing sections.",
          );
        for (let j = i === 1 ? 0 : 1; j <= count; j++) {
          const a = lerp(left[i - 1], left[i], j / count),
            b = lerp(right[i - 1], right[i], j / count),
            width = distance(a, b);
          const inset = Math.min(0.49, layer.inset / Math.max(0.001, width));
          rungs.push([lerp(a, b, inset), lerp(a, b, 1 - inset)]);
        }
      }
      for (
        let pass = 0;
        pass < (layer.kind === "double-zigzag" ? 2 : 1);
        pass++
      ) {
        const points = rungs.map((r, i) => r[(i + pass) % 2]);
        yield* emit(pass ? points.reverse() : points);
      }
      continue;
    }
    const angle = ((object.angle + layer.angle) * Math.PI) / 180;
    const paths = contours.map((path) => path.map((p) => rotate(p, -angle)));
    const b = bounds(paths);
    const bands = tatamiBands(
      paths,
      rule,
      layer.kind === "tatami"
        ? layer.spacing
        : layer.kind === "center"
          ? layer.length
          : layer.spacing / 2,
    );
    if (layer.kind === "tatami") {
      for (const { row, reverse } of orderedTatamiRows(bands, {
        x: b.minX,
        y: b.minY,
      })) {
        const xs = tatamiNeedles(
          row.left,
          row.right,
          b.minX,
          row.index,
          layer.length,
          1 / 3,
          0.1,
          reverse,
        );
        yield {
          points: xs.map((x) => rotate({ x, y: row.y }, angle)),
          maxLength: layer.length,
          layer,
          contours,
          rule,
        };
      }
    } else
      for (const band of bands) {
        for (
          let pass = 0;
          pass < (layer.kind === "double-zigzag" ? 2 : 1);
          pass++
        ) {
          const points = band.map((row, i) =>
            rotate(
              {
                x:
                  layer.kind === "center"
                    ? (row.left + row.right) / 2
                    : (i + pass) % 2
                      ? row.right
                      : row.left,
                y: row.y,
              },
              angle,
            ),
          );
          yield* emit(pass ? points.reverse() : points);
        }
      }
  }
}
