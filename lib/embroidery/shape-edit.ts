import { bounds, distance, simplify } from "./geometry";
import { outlinePaths } from "./operations";
import { curvePaths } from "./reshape";
import {
  booleanPolygons,
  filledObject,
  knifeObject,
  normalizePolygons,
  objectPolygons,
  offsetPolygons,
  polygonArea,
  polygonObjects,
  strokePolygons,
  type BooleanOperation,
} from "./polygons";
import {
  makeObject,
  type EmbroideryObject,
  type Point,
  type Project,
} from "./types";

export type ShapeAction =
  | BooleanOperation
  | "offset"
  | "border"
  | "remove-overlaps"
  | "simplify"
  | "blend"
  | "applique"
  | "knife"
  | "erase";
export type ShapeOptions = {
  action: ShapeAction;
  ids: string[];
  amount: number;
  points?: Point[];
  color?: string;
  seed: string;
};
export type ShapeResult = {
  project: Project;
  changed: number;
  notes: string[];
};

export function editShapes(
  project: Project,
  options: ShapeOptions,
): ShapeResult {
  const selected = project.objects.filter(
    (o) => options.ids.includes(o.id) && !o.locked && o.visible,
  );
  if (!selected.length)
    throw new Error("Select at least one visible, unlocked object.");
  const total = selected.reduce(
    (sum, o) => sum + o.paths.reduce((n, p) => n + p.length, 0),
    0,
  );
  if (total > 40000)
    throw new Error(
      "This edit exceeds 40,000 selected points. Work on a smaller selection or simplify it first.",
    );
  let objects = [...project.objects],
    changed = 0;
  const notes: string[] = [];
  const replacements = new Map<string, EmbroideryObject[]>();
  const action = options.action;
  const seed = options.seed.slice(0, 10);
  const fresh = (parts: EmbroideryObject[]) =>
    parts.map((part, i) => ({
      ...part,
      id: `${seed}-${part.id.slice(-70)}-${i}`,
    }));
  if (["union", "difference", "intersection", "xor"].includes(action)) {
    if (selected.length < 2)
      throw new Error("Select at least two closed shapes.");
    const base = selected[0];
    let result = objectPolygons(base);
    for (const object of selected.slice(1))
      result = booleanPolygons(
        result,
        objectPolygons(object),
        action as BooleanOperation,
      );
    selected.forEach((o) => replacements.set(o.id, []));
    replacements.set(base.id, fresh(polygonObjects(base, result, action)));
    changed = selected.length;
    notes.push(
      "The first object in sewing order supplies the resulting colour and stitch settings.",
    );
  } else if (action === "remove-overlaps") {
    // Only opaque, solid fills remove lower coverage. Sparse decorative fills
    // and artwork must not erase stitching that is meant to show through them.
    const opaque = (o: EmbroideryObject) =>
      ["tatami", "program-split", "satin", "satin-column", "column-c"].includes(
        o.type,
      ) &&
      !o.spacingEnd &&
      (!o.edgeEffect || o.edgeEffect === "none");
    for (let i = 0; i < selected.length; i++) {
      const object = selected[i];
      if (!opaque(object)) continue;
      let result = objectPolygons(object);
      const box = bounds(result);
      let removed = false;
      for (const top of selected.slice(i + 1).filter(opaque)) {
        const topBox = bounds(outlinePaths(top));
        if (
          box.maxX <= topBox.minX ||
          box.minX >= topBox.maxX ||
          box.maxY <= topBox.minY ||
          box.minY >= topBox.maxY
        )
          continue;
        const cutter = offsetPolygons(
          objectPolygons(top),
          -Math.max(0, options.amount),
        );
        const next = booleanPolygons(result, cutter, "difference");
        if (polygonArea(result) - polygonArea(next) > 0.001) {
          removed = true;
          result = next;
        }
      }
      if (removed) {
        replacements.set(
          object.id,
          fresh(polygonObjects(object, result, "overlap")),
        );
        changed++;
      }
    }
    notes.push(
      `${options.amount.toFixed(2)} mm of geometric overlap retained at covering edges. Sparse and gradient fills do not act as cutters.`,
    );
  } else {
    for (const object of selected) {
      let parts: EmbroideryObject[] = [object];
      if (action === "knife")
        parts = knifeObject(object, options.points![0], options.points![1]);
      else if (action === "erase") {
        if (!filledObject(object)) continue;
        const mask = strokePolygons(options.points ?? [], options.amount / 2);
        const original = objectPolygons(object),
          result = booleanPolygons(original, mask, "difference");
        if (polygonArea(original) - polygonArea(result) > 0.001)
          parts = polygonObjects(object, result, "erase");
      } else if (action === "offset") {
        parts = polygonObjects(
          object,
          offsetPolygons(objectPolygons(object), options.amount),
          "offset",
        );
      } else if (action === "border") {
        const original = objectPolygons(object),
          outer = offsetPolygons(original, options.amount);
        const ring =
          options.amount >= 0
            ? booleanPolygons(outer, original, "difference")
            : booleanPolygons(original, outer, "difference");
        parts = [
          object,
          ...polygonObjects(
            {
              ...object,
              color: options.color ?? object.color,
              type: "satin",
              angle: object.angle,
            },
            ring,
            "border",
          ),
        ];
        notes.push(
          "Border uses parallel satin. Draw paired rails for a turning satin edge, or use an appliqué edge.",
        );
      } else if (action === "simplify") {
        if (object.type === "satin-column") {
          notes.push(
            "Paired satin rails kept intact to preserve their stitch directions.",
          );
          continue;
        }
        const paths = curvePaths(object).map((path, i) => {
          const source =
            object.closed[i] &&
            distance(path[0], path[path.length - 1]) > 0.0001
              ? [...path, path[0]]
              : path;
          const result = simplify(source, Math.max(0.001, options.amount));
          if (
            object.closed[i] &&
            distance(result[0], result[result.length - 1]) < 0.0001
          )
            result.pop();
          return result.length >= (object.closed[i] ? 3 : 2) ? result : path;
        });
        parts = [{ ...object, paths }];
      } else if (action === "blend") {
        const contour = objectPolygons(object),
          groupId = `${seed}-blend-${object.id.slice(-50)}`;
        const base = {
          ...object,
          paths: contour,
          closed: contour.map(() => true),
          fillRule: "nonzero" as const,
          type: "tatami" as const,
          groupId,
          tatamiOffset: 0.25,
        };
        parts = [
          {
            ...base,
            id: `${groupId}-a`,
            name: `${object.name} · shade A`.slice(0, 100),
            spacing: 0.6,
            spacingEnd: 1.8,
          },
          {
            ...base,
            id: `${groupId}-b`,
            name: `${object.name} · shade B`.slice(0, 100),
            color: options.color ?? "#17283a",
            spacing: 1.8,
            spacingEnd: 0.6,
            underlay: false,
          },
        ];
        notes.push(
          "Two editable tatami layers crossfade from 75/25 to 25/75 colour coverage. Combined nominal density stays at one row per 0.45 mm; only the first layer has underlay. Verify thread buildup in a sew-out.",
        );
      } else if (action === "applique") {
        const contour = objectPolygons(object),
          groupId = `${seed}-applique-${object.id.slice(-45)}`;
        const width = Math.max(0.5, Math.min(6, options.amount));
        const base = {
          paths: contour,
          closed: contour.map(() => true),
          color: options.color ?? object.color,
          groupId,
          underlay: false,
          pull: 0,
          fillRule: "nonzero" as const,
        };
        parts = [
          makeObject({
            ...base,
            id: `${groupId}-placement`,
            name: `${object.name} · placement`.slice(0, 100),
            type: "run",
            length: 2,
            pauseAfter: true,
          }),
          makeObject({
            ...base,
            id: `${groupId}-tack`,
            name: `${object.name} · tack down`.slice(0, 100),
            paths: offsetPolygons(contour, -0.3),
            type: "run",
            length: 1.5,
            pauseAfter: true,
          }),
          makeObject({
            ...base,
            id: `${groupId}-cover`,
            name: `${object.name} · cover edge`.slice(0, 100),
            type: "zigzag",
            spacing: 0.4,
            lineWidth: width,
            pauseAfter: false,
          }),
        ]
          .filter((o) => o.paths.length)
          .map((o) => ({
            ...o,
            closed: o.paths.map(() => true),
            forceTrim: true,
          }));
        notes.push(
          "Placement → pause to place fabric → tack down → pause to cut fabric → cover edge. Review the controller's colour-stop/pause interpretation before sewing.",
        );
      }
      if (parts.length !== 1 || parts[0] !== object) {
        replacements.set(
          object.id,
          parts.map((part) => (part === object ? part : fresh([part])[0])),
        );
        changed++;
      }
    }
  }
  if (
    selected.some((o) => ["satin-column", "column-c"].includes(o.type)) &&
    [
      "knife",
      "offset",
      "erase",
      "union",
      "difference",
      "intersection",
      "xor",
      "remove-overlaps",
    ].includes(action)
  )
    notes.push(
      "Cut satin columns become parallel satin shapes; redraw paired rails where a turning edge is needed.",
    );
  objects = objects.flatMap((o) => replacements.get(o.id) ?? [o]);
  assertGeometryBudget(objects);
  return {
    project: { ...project, objects },
    changed,
    notes: [...new Set(notes)],
  };
}
import { assertGeometryBudget } from "./complexity";

/** Physical 1:1 vector outlines, with holes; no stitch or laser-power commands. */
export function exportCutSVG(
  project: Project,
  ids: string[],
  allowance: number,
): string {
  const shapes = project.objects.filter((o) => o.visible && ids.includes(o.id));
  if (!shapes.length)
    throw new Error("Select shapes to export cutting outlines.");
  const paths = normalizePolygons(
    shapes.flatMap((o) =>
      !["satin-column", "column-c"].includes(o.type) && o.closed.every(Boolean)
        ? normalizePolygons(outlinePaths(o), o.fillRule)
        : objectPolygons(o),
    ),
    "nonzero",
  );
  const output = offsetPolygons(paths, allowance);
  if (!output.length)
    throw new Error("No closed cutting contours remain at this allowance.");
  const box = bounds(output),
    x = Math.min(0, box.minX),
    y = Math.min(0, box.minY),
    width = Math.max(project.width, box.maxX) - x,
    height = Math.max(project.height, box.maxY) - y;
  const d = output
    .map(
      (path) =>
        path
          .map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(3)} ${p.y.toFixed(3)}`)
          .join(" ") + " Z",
    )
    .join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${x} ${y} ${width} ${height}"><title>Threadform cutting outlines</title><desc>1:1 millimetres. Allowance ${allowance} mm. Verify scale and tool settings before cutting.</desc><path d="${d}" fill="none" stroke="#ff0066" stroke-width="0.1"/></svg>`;
}
