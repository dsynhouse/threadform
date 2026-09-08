import { underlayLayer } from "./underlay-settings";
import { bounds, rotate, scanline, signedArea, suggestType } from "./geometry";
import { booleanPolygons, normalizePolygons } from "./polygons";
import { separateElements } from "./operations";
import {
  FABRICS,
  type EmbroideryObject,
  type Point,
  type Project,
} from "./types";

export type AutoOptions = {
  satinWidth: number;
  detailWidth: number;
  preserveMethods: boolean;
  includeArtwork: boolean;
  separate: boolean;
  ids: string[];
};
export const DEFAULT_AUTO: AutoOptions = {
  satinWidth: 7,
  detailWidth: 0.7,
  preserveMethods: true,
  includeArtwork: true,
  separate: true,
  ids: [],
};
export type AutoDecision = {
  id: string;
  name: string;
  method: string;
  reason: string;
  review: boolean;
};
export type AutoResult = {
  project: Project;
  decisions: AutoDecision[];
  changed: number;
};
const area = (paths: Point[][]) =>
  Math.abs(paths.reduce((s, p) => s + signedArea(p), 0));

/** Search monotone cross-sections, then validate the resulting paired rails with
 * an actual polygon symmetric difference. Branched shapes and holes stay filled.
 * This is deliberately geometry-based and never guesses what an image depicts. */
export function inferSatinRails(o: EmbroideryObject, maxWidth: number) {
  if (o.paths.length !== 1 || o.paths[0].length < 3 || !o.closed.every(Boolean))
    return null;
  const original = normalizePolygons(o.paths, o.fillRule);
  if (original.length !== 1) return null;
  const originalArea = area(original);
  if (originalArea < 0.1) return null;
  let best: {
    paths: Point[][];
    maxWidth: number;
    minWidth: number;
    error: number;
  } | null = null;
  let work = 0;
  for (let degrees = 0; degrees < 180; degrees += 15) {
    const a = (degrees * Math.PI) / 180;
    const local = original.map((p) => p.map((v) => rotate(v, -a)));
    const b = bounds(local),
      height = b.maxY - b.minY;
    if (height < 1.5) continue;
    const rows = Math.min(2000, Math.max(8, Math.ceil(height / 0.25)));
    work += rows * o.paths[0].length;
    if (work > 8000000) break;
    const left: Point[] = [],
      right: Point[] = [];
    let valid = true,
      widthMax = 0,
      widthMin = Infinity;
    for (let row = 0; row <= rows; row++) {
      const y =
        b.minY +
        Math.max(0.001, Math.min(height - 0.001, (height * row) / rows));
      const spans = scanline(local, y, "nonzero");
      if (spans.length !== 1) {
        valid = false;
        break;
      }
      const [l, r] = spans[0],
        width = r - l;
      if (width > maxWidth || width < 0.04) {
        valid = false;
        break;
      }
      widthMax = Math.max(widthMax, width);
      widthMin = Math.min(widthMin, width);
      left.push(rotate({ x: l, y }, a));
      right.push(rotate({ x: r, y }, a));
    }
    if (!valid || height < widthMax * 1.2) continue;
    const outline = normalizePolygons(
      [[...left, ...right.slice().reverse()]],
      "nonzero",
    );
    const error =
      area(booleanPolygons(original, outline, "xor")) / originalArea;
    if (
      error <= 0.025 &&
      (!best ||
        widthMax < best.maxWidth - 0.05 ||
        (Math.abs(widthMax - best.maxWidth) < 0.05 && error < best.error))
    )
      best = {
        paths: [left, right],
        maxWidth: widthMax,
        minWidth: widthMin,
        error,
      };
  }
  return best;
}

export function autoDigitizeProject(
  project: Project,
  options: AutoOptions,
): AutoResult {
  if (
    !Number.isFinite(options.satinWidth) ||
    options.satinWidth < 1 ||
    options.satinWidth > 7 ||
    !Number.isFinite(options.detailWidth) ||
    options.detailWidth < 0.3 ||
    options.detailWidth > 1.5
  )
    throw new Error(
      "Choose satin width 1–7 mm and detail threshold 0.3–1.5 mm.",
    );
  const decisions: AutoDecision[] = [],
    objects: EmbroideryObject[] = [];
  const preset = FABRICS[project.fabric];
  let changed = 0;
  for (const original of project.objects) {
    const selected = !options.ids.length || options.ids.includes(original.id);
    const custom = !["none", "satin", "tatami"].includes(original.type);
    const keep =
      !selected ||
      original.locked ||
      !original.visible ||
      (original.artworkRole && original.artworkRole !== "embroidery") ||
      (original.type === "none" && !options.includeArtwork) ||
      (options.preserveMethods && custom) ||
      ["satin-column", "column-c"].includes(original.type);
    if (keep) {
      objects.push(original);
      if (selected)
        decisions.push({
          id: original.id,
          name: original.name,
          method: original.type,
          reason:
            "Existing method, rail geometry, visibility or object lock retained.",
          review: false,
        });
      continue;
    }
    const parts =
      options.separate && original.closed.every(Boolean)
        ? separateElements(original)
        : [original];
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const o = {
        ...part,
        id:
          parts.length === 1
            ? original.id
            : `${original.id.slice(0, 65)}-auto-${index}`,
      };
      let reason: string,
        review = false;
      if (!o.closed.every(Boolean)) {
        Object.assign(o, { type: "run", underlay: false, pull: 0, length: 2 });
        reason =
          "Open path preserved as a running stitch; shorter length follows detail.";
      } else {
        const rails = inferSatinRails(o, options.satinWidth);
        if (rails) {
          Object.assign(o, {
            type: "satin-column",
            paths: rails.paths,
            closed: [false, false],
            spacing: preset.spacing,
            pull: preset.pull,
            underlay: rails.maxWidth >= 1,
            underlayKind: rails.maxWidth < 2 ? "center" : "zigzag",
            underlays: original.underlays ?? [
              underlayLayer("center"),
              ...(rails.maxWidth >= 3
                ? [
                    {
                      ...underlayLayer("zigzag", "underlay-2"),
                      inset: Math.min(0.65, rails.minWidth / 4),
                    },
                  ]
                : []),
            ],
            length: 3,
          });
          review = rails.minWidth < options.detailWidth;
          reason = `Turning satin; widest span ${rails.maxWidth.toFixed(2)} mm. Outline difference ${(rails.error * 100).toFixed(2)}% by area.${review ? " Narrow tips need density review." : ""}`;
        } else {
          const suggested = suggestType(o);
          Object.assign(o, {
            type: "tatami",
            angle: o.directionLocked ? o.angle : suggested.angle,
            spacing: preset.spacing,
            pull: preset.pull,
            length: 3,
            underlay: true,
            underlayKind: "edge",
            underlays: original.underlays ?? [
              underlayLayer("edge"),
              underlayLayer("tatami", "underlay-2"),
            ],
          });
          const b = bounds(o.paths),
            narrow =
              Math.min(b.maxX - b.minX, b.maxY - b.minY) < options.detailWidth;
          review = narrow || o.paths.length > 1;
          reason = narrow
            ? "Small detail retained. Review its physical size before sewing."
            : o.paths.length > 1
              ? "Interior holes retained in tatami. Check narrow bridges and connector travel."
              : "Tatami retains the closed outline; no reliable narrow satin strip was found.";
        }
      }
      if (original.directionLocked && o.type === "satin-column") {
        Object.assign(o, {
          type: "satin",
          paths: part.paths,
          closed: part.closed,
          angle: original.angle,
        });
        reason =
          "Parallel satin with your locked stitch angle. Inspect span widths.";
        review = true;
      }
      decisions.push({
        id: o.id,
        name: o.name,
        method: o.type,
        reason,
        review,
      });
      objects.push(o);
      changed++;
    }
  }
  assertGeometryBudget(objects);
  return { project: { ...project, objects }, decisions, changed };
}
import { assertGeometryBudget } from "./complexity";
