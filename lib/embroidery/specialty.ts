import { bounds, distance, inside, rotate } from "./geometry";
import { orderedTatamiRows, tatamiBands } from "./tatami";
import { normalizePolygons, offsetPolygons } from "./polygons";
import type { EmbroideryObject, Point } from "./types";

export const CROSS_TYPES = [
  "cross",
  "half-cross",
  "quarter-cross",
  "petite-cross",
];
export const SPECIAL_FILLS = [
  "island-coil",
  "square-fill",
  "double-square",
  ...CROSS_TYPES,
];

/** Original lockstitch implementations of the documented pattern geometries.
 * These paths contain no chenille needle-height, moss or chain commands. */
export function* specialtyPaths(
  o: EmbroideryObject,
  contours: Point[][],
): Generator<Point[]> {
  const angle = (o.angle * Math.PI) / 180;
  const local = contours.map((p) => p.map((v) => rotate(v, -angle)));
  const b = bounds(local);
  const world = (p: Point[]) => p.map((v) => rotate(v, angle));
  if (o.type === "island-coil") {
    const original = normalizePolygons(local, o.fillRule);
    const spacing = Math.max(0.2, o.spacing);
    const layers: Point[][][] = [];
    let work = 0;
    // Inset from the original at every level: no cumulative offset error.
    for (let i = 0; ; i++) {
      const rings = offsetPolygons(original, -(i + 0.5) * spacing, "nonzero");
      if (!rings.length) break;
      if (i >= 3000)
        throw new Error(
          "Island coil exceeds the contour budget. Increase spacing or divide the region; incomplete coils cannot be exported.",
        );
      work += rings.reduce((s, p) => s + p.length, 0);
      if (work > 160000)
        throw new Error(
          "Island coil exceeds the path budget. Increase spacing or divide the region.",
        );
      layers.push(rings);
    }
    // Alternate levels inward, return through the skipped levels. Each island
    // remains a separate contour; the engine only sews contained connectors.
    const order = layers
      .map((_, i) => i)
      .filter((i) => i % 2 === 0)
      .concat(
        layers
          .map((_, i) => i)
          .filter((i) => i % 2 === 1)
          .reverse(),
      );
    let last: Point | undefined;
    for (const index of order)
      for (const ring of layers[index]) {
        let start = 0;
        if (last)
          for (let i = 1; i < ring.length; i++)
            if (distance(last, ring[i]) < distance(last, ring[start]))
              start = i;
        const p = [...ring.slice(start), ...ring.slice(0, start), ring[start]];
        if (index % 2) p.reverse();
        last = p.at(-1);
        yield world(p);
      }
    return;
  }
  if (o.type === "square-fill" || o.type === "double-square") {
    const passes = o.type === "double-square" ? 2 : 1;
    let last: Point | undefined;
    for (let pass = 0; pass < passes; pass++) {
      const a = angle + (pass * Math.PI) / 2;
      const paths = contours.map((p) => p.map((v) => rotate(v, -a)));
      const box = bounds(paths);
      const bands = tatamiBands(paths, o.fillRule, Math.max(0.2, o.spacing));
      for (const { row, reverse } of orderedTatamiRows(
        bands,
        last ? rotate(last, -a) : { x: box.minX, y: box.minY },
      )) {
        const from = rotate({ x: reverse ? row.right : row.left, y: row.y }, a);
        last = rotate({ x: reverse ? row.left : row.right, y: row.y }, a);
        yield [from, last];
      }
    }
    return;
  }
  const size = o.crossSize ?? o.patternSize ?? 2;
  const cells =
    Math.ceil((b.maxX - b.minX) / size + 2) *
    Math.ceil((b.maxY - b.minY) / size + 2);
  const edges = local.reduce((s, p) => s + p.length, 0);
  if (cells > 40000 || cells * edges > 30000000)
    throw new Error(
      "Cross-stitch grid exceeds the detail budget. Increase cell size or divide the region.",
    );
  const slash = o.crossTop !== "backslash";
  const legs = (x: number, y: number, s: number): Point[][] => {
    const a = [
      { x, y },
      { x: x + s, y: y + s },
    ];
    const z = [
      { x, y: y + s },
      { x: x + s, y },
    ];
    if (o.type === "quarter-cross")
      return [
        [
          { x, y: y + s },
          { x: x + s / 2, y: y + s / 2 },
        ],
      ];
    if (o.type === "half-cross") return [slash ? z : a];
    return slash ? [a, z] : [z, a];
  };
  // Anchor to physical coordinates so adjacent objects share grid intersections.
  let row = 0;
  for (
    let y = Math.floor(b.minY / size) * size;
    y < b.maxY - 1e-6;
    y += size, row++
  ) {
    const pairs: Point[][][] = [];
    for (
      let x = Math.floor(b.minX / size) * size;
      x < b.maxX - 1e-6;
      x += size
    ) {
      if (!inside({ x: x + size / 2, y: y + size / 2 }, local, o.fillRule))
        continue;
      if (o.type === "petite-cross") {
        for (const dx of [0, size / 2])
          for (const dy of [0, size / 2])
            pairs.push(legs(x + dx, y + dy, size / 2));
      } else pairs.push(legs(x, y, size));
    }
    if (row % 2) pairs.reverse();
    const paths =
      o.crossOrder === "danish" &&
      !["half-cross", "quarter-cross"].includes(o.type)
        ? [
            ...pairs.map((p) => p[0]),
            ...pairs
              .slice()
              .reverse()
              .map((p) => p[1]),
          ]
        : pairs.flat();
    for (const p of paths) {
      const repeated = [...p];
      for (let i = 1; i < (o.crossRepeats ?? 1); i++)
        repeated.push(...(i % 2 ? p.slice().reverse() : p));
      yield world(repeated);
    }
  }
}
