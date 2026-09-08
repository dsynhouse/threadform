import { outlinePaths } from "./operations";
import { LINE_TYPES, type EmbroideryObject, type StitchType } from "./types";
/** One conversion path for properties, library, keyboard and command search. */
export function changeStitchMethod(
  o: EmbroideryObject,
  type: StitchType,
): EmbroideryObject {
  if (o.locked || type === o.type) return o;
  if (type === "satin-column") return o; // paired rails require explicit digitizing
  const wasColumn = ["satin-column", "column-c"].includes(o.type);
  const paths = wasColumn ? outlinePaths(o) : o.paths;
  const closed = wasColumn ? paths.map(() => true) : o.closed;
  return {
    ...o,
    type,
    paths,
    closed,
    columnKind: undefined,
    keepLastStitch: undefined,
    columnOffset: undefined,
    underlay:
      type.includes("cross") ||
      LINE_TYPES.includes(type) ||
      type === "raised-satin"
        ? false
        : o.underlay,
    pull: type.includes("cross") || LINE_TYPES.includes(type) ? 0 : o.pull,
    ...(type === "raised-satin" ? { satinLayers: o.satinLayers ?? 3 } : {}),
  };
}
