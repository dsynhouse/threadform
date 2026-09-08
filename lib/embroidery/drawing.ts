import { distance, simplify } from "./geometry";
import type { Point } from "./types";
import { makeObject } from "./types";
import { columnA, columnB, columnC, widthFromReferences } from "./columns";
import { outlinePaths } from "./operations";

export type DigitizingDraft = {
  pen: Point[];
  firstRail: Point[];
  columnBase: Point[];
};
/** Backspace unwinds the current stage before removing points from a captured edge. */
export function undoDigitizingDraft(draft: DigitizingDraft): DigitizingDraft {
  if (draft.pen.length) return { ...draft, pen: draft.pen.slice(0, -1) };
  if (draft.columnBase.length)
    return { ...draft, pen: draft.columnBase, columnBase: [] };
  if (draft.firstRail.length)
    return { ...draft, pen: draft.firstRail, firstRail: [] };
  return draft;
}
export function snapDrawingPoint(
  point: Point,
  snap: boolean,
  altKey: boolean,
): Point {
  return snap && !altKey
    ? { x: Math.round(point.x), y: Math.round(point.y) }
    : point;
}
/** Screen-distance sampling remains stable while zooming. Coalesced samples use the same rule. */
export function appendSketchSamples(
  points: Point[],
  samples: Point[],
  scale: number,
): Point[] {
  const result = [...points],
    step = Math.max(0.005, 0.4 / Math.max(1e-8, scale));
  for (const sample of samples)
    if (
      Number.isFinite(sample.x) &&
      Number.isFinite(sample.y) &&
      (!result.length || distance(result.at(-1)!, sample) >= step)
    )
      result.push({ x: sample.x, y: sample.y });
  return result;
}
/** Preserve the exact start/end and corners while removing subpixel hand jitter. */
export function sketchPath(
  points: Point[],
  end: Point,
  smoothing: number,
  scale: number,
): Point[] {
  const path = [...points];
  if (!path.length || distance(path.at(-1)!, end) > 1e-8) path.push(end);
  const strength = Math.max(0, Math.min(1, smoothing));
  if (!strength) return path;
  return simplify(path, Math.min(0.3, 1 / Math.max(1e-8, scale)) * strength);
}

/** Preview uses the same column geometry as the committed object, without generating stitches. */
export function columnDraftOutline(
  tool: string,
  draft: DigitizingDraft,
  hover: Point | null,
  curve: boolean,
  fallbackWidth = 3,
  fallbackOffset = 0,
): Point[][] {
  const points = hover ? [...draft.pen, { ...hover, curve }] : draft.pen;
  try {
    let partial;
    if (tool === "satin-column") {
      const paired = points.slice(0, points.length - (points.length % 2));
      if (paired.length < 4) return [];
      partial = columnA(paired);
    } else if (tool === "column-b") {
      if (draft.firstRail.length < 2 || points.length < 2) return [];
      partial = columnB(draft.firstRail, points);
    } else if (tool === "column-c") {
      const base = draft.columnBase.length ? draft.columnBase : points;
      if (base.length < 2) return [];
      const refs = draft.columnBase.length
        ? draft.pen.length >= 2
          ? draft.pen
          : points
        : [];
      const dimensions =
        refs.length === 2
          ? widthFromReferences(base, refs, fallbackWidth)
          : { width: fallbackWidth, offset: fallbackOffset };
      partial = columnC(base, dimensions.width, dimensions.offset);
    } else return [];
    return outlinePaths(
      makeObject({
        id: "column-guide",
        name: "Column guide",
        paths: [],
        ...partial,
      }),
    );
  } catch {
    return [];
  }
}
