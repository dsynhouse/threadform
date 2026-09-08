import { bounds } from "./geometry";
import { type EmbroideryObject, type Point } from "./types";
import { transformObject } from "./operations";
import { geometryCost, GEOMETRY_BUDGET } from "./complexity";
export const SHAPE_NAMES = {
  leaf: "Leaf",
  petal: "Petal",
  flower: "Six-petal flower",
  star: "Star",
  heart: "Heart",
  ring: "Ring",
  shield: "Shield",
  scallop: "Scalloped seal",
} as const;
export type ShapeName = keyof typeof SHAPE_NAMES;
export function motifShape(
  kind: ShapeName,
  size: number,
  center: Point,
): Point[][] {
  const circle = (radius: number, count = 96) =>
    Array.from({ length: count }, (_, i) => ({
      x: center.x + Math.cos((i / count) * Math.PI * 2) * radius,
      y: center.y + Math.sin((i / count) * Math.PI * 2) * radius,
    }));
  if (kind === "ring") return [circle(size / 2), circle(size * 0.31).reverse()];
  if (kind === "shield")
    return [
      [
        { x: center.x - size * 0.45, y: center.y - size * 0.5 },
        { x: center.x + size * 0.45, y: center.y - size * 0.5 },
        { x: center.x + size * 0.4, y: center.y + size * 0.18 },
        { x: center.x, y: center.y + size * 0.5 },
        { x: center.x - size * 0.4, y: center.y + size * 0.18 },
      ],
    ];
  if (kind === "star")
    return [
      Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5 - Math.PI / 2,
          r = size * (i % 2 ? 0.21 : 0.5);
        return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
      }),
    ];
  if (kind === "heart")
    return [
      Array.from({ length: 160 }, (_, i) => {
        const t = (i / 160) * Math.PI * 2;
        return {
          x: center.x + (size * Math.sin(t) ** 3) / 2,
          y:
            center.y -
            (size *
              (13 * Math.cos(t) -
                5 * Math.cos(2 * t) -
                2 * Math.cos(3 * t) -
                Math.cos(4 * t))) /
              32,
        };
      }),
    ];
  if (kind === "leaf" || kind === "petal")
    return [
      Array.from({ length: 120 }, (_, i) => {
        const t = (i / 120) * Math.PI * 2;
        return {
          x:
            center.x +
            Math.sin(t) *
              Math.abs(Math.sin(t)) *
              size *
              (kind === "leaf" ? 0.23 : 0.33),
          y: center.y + Math.cos(t) * size * 0.5,
        };
      }),
    ];
  const count = kind === "flower" ? 6 : 12;
  return [
    Array.from({ length: 240 }, (_, i) => {
      const a = (i / 240) * Math.PI * 2,
        r =
          size *
          (kind === "flower"
            ? 0.34 + 0.16 * Math.cos(count * a)
            : 0.46 + 0.04 * Math.cos(count * a));
      return { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
    }),
  ];
}
export type PatternOptions = {
  layout: "grid" | "radial";
  rows: number;
  columns: number;
  gap: number;
  count: number;
  radius: number;
  rotate: boolean;
  mirror: boolean;
};
export function repeatObjects(
  objects: EmbroideryObject[],
  options: PatternOptions,
  center: Point,
  idPrefix: string,
): EmbroideryObject[] {
  if (!objects.length) return [];
  const count =
    options.layout === "radial"
      ? options.count
      : options.rows * options.columns;
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count * geometryCost(objects) > GEOMETRY_BUDGET
  )
    throw new Error(
      "This repeat exceeds the vector processing budget. Reduce its repetitions or simplify the source paths.",
    );
  const box = bounds(objects.flatMap((o) => o.paths)),
    cx = (box.minX + box.maxX) / 2,
    cy = (box.minY + box.maxY) / 2,
    width = box.maxX - box.minX,
    height = box.maxY - box.minY;
  return Array.from({ length: count }, (_, i) => {
    const angle = options.layout === "radial" ? (i / count) * Math.PI * 2 : 0,
      rotation = options.rotate ? angle : 0;
    const dx =
        options.layout === "radial"
          ? center.x + Math.cos(angle) * options.radius
          : cx + (i % options.columns) * (width + options.gap),
      dy =
        options.layout === "radial"
          ? center.y + Math.sin(angle) * options.radius
          : cy + Math.floor(i / options.columns) * (height + options.gap);
    return objects.map((o, j) => ({
      ...transformObject(o, (p) => {
        const x = (p.x - cx) * (options.mirror && i % 2 ? -1 : 1),
          y = p.y - cy;
        return {
          x: dx + x * Math.cos(rotation) - y * Math.sin(rotation),
          y: dy + x * Math.sin(rotation) + y * Math.cos(rotation),
        };
      }),
      angle:
        ((options.mirror && i % 2 ? 180 - o.angle : o.angle) +
          (rotation * 180) / Math.PI) %
        180,
      id: `${idPrefix}-${i}-${j}`,
      groupId: `${idPrefix}-${i}`,
      name: `${o.name} · ${i + 1}`.slice(0, 100),
      locked: false,
    }));
  }).flat();
}

/** Smooth a closed chain with cubic Catmull–Rom segments, flattened at a physical tolerance. */
export function smoothContour(points: Point[], tolerance = 0.06): Point[] {
  if (points.length < 3) return points;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length; i++) {
    const a = points[(i - 1 + points.length) % points.length],
      b = points[i],
      c = points[(i + 1) % points.length],
      e = points[(i + 2) % points.length];
    d += ` C ${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6} ${c.x - (e.x - b.x) / 6} ${c.y - (e.y - b.y) / 6} ${c.x} ${c.y}`;
  }
  return parsePath(d + " Z", tolerance).paths[0];
}
import { parsePath } from "./svg-path";
