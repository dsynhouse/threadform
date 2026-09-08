import type { EmbroideryObject } from "./types";
// Bound memory/work by geometry, not a fixed number of colours, regions or objects.
export const GEOMETRY_BUDGET = 150000;
export function geometryCost(objects: Pick<EmbroideryObject, "paths">[]) {
  return objects.reduce(
    (n, o) => n + 8 + o.paths.reduce((s, p) => s + 1 + p.length, 0),
    0,
  );
}
export function assertGeometryBudget(
  objects: Pick<EmbroideryObject, "paths">[],
) {
  if (geometryCost(objects) > GEOMETRY_BUDGET)
    throw new Error(
      "This operation exceeds the vector processing budget. Keep colours grouped or increase contour simplification; your current artwork is unchanged.",
    );
}
