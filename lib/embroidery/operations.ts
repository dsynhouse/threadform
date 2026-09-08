import { bounds, distance, inside, signedArea } from "./geometry";
import { centrelineRails } from "./digitizing";
import { curvePaths } from "./reshape";
import {
  type EmbroideryObject,
  type Point,
  type Project,
  type StitchPlan,
} from "./types";

/** Evaluate editable column nodes into paired rails before outlining their footprint. */
export function outlinePaths(object: EmbroideryObject): Point[][] {
  object = { ...object, paths: curvePaths(object) };
  if (object.type === "column-c")
    return object.paths
      .filter((p) => p.length > 1)
      .map((path) => {
        const [a, b] = centrelineRails(
          object.closed[object.paths.indexOf(path)] ? [...path, path[0]] : path,
          object.lineWidth ?? 3,
          object.columnOffset ?? 0,
        );
        return [...a, ...b.reverse()];
      });
  if (object.type !== "satin-column") return object.paths;
  if (object.paths.length !== 2) return [];
  return [[...object.paths[0], ...object.paths[1].slice().reverse()]];
}
export function transformObject(
  object: EmbroideryObject,
  map: (point: Point) => Point,
): EmbroideryObject {
  return {
    ...object,
    paths: object.paths.map((path) =>
      path.map((p) => ({
        ...p,
        ...map(p),
        handleIn: p.handleIn ? map(p.handleIn) : undefined,
        handleOut: p.handleOut ? map(p.handleOut) : undefined,
      })),
    ),
    entryPoint: object.entryPoint ? map(object.entryPoint) : undefined,
    exitPoint: object.exitPoint ? map(object.exitPoint) : undefined,
  };
}
export function moveObject(object: EmbroideryObject, dx: number, dy: number) {
  return transformObject(object, (point) => ({
    x: point.x + dx,
    y: point.y + dy,
  }));
}
export function rotateObject(
  object: EmbroideryObject,
  degrees: number,
): EmbroideryObject {
  const box = bounds(object.paths),
    cx = (box.minX + box.maxX) / 2,
    cy = (box.minY + box.maxY) / 2;
  const angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    ...transformObject(object, (p) => ({
      x: cx + (p.x - cx) * c - (p.y - cy) * s,
      y: cy + (p.x - cx) * s + (p.y - cy) * c,
    })),
    angle: (object.angle + (degrees % 180) + 180) % 180,
  };
}
export function flipObject(object: EmbroideryObject, axis: "x" | "y") {
  const box = bounds(object.paths);
  return {
    ...transformObject(object, (p) =>
      axis === "x"
        ? { x: box.minX + box.maxX - p.x, y: p.y }
        : { x: p.x, y: box.minY + box.maxY - p.y },
    ),
    angle: (180 - object.angle) % 180,
    ...(object.underlays
      ? {
          underlays: object.underlays.map((layer) => ({
            ...layer,
            angle: -layer.angle,
          })),
        }
      : {}),
    ...(object.columnOffset !== undefined
      ? { columnOffset: -object.columnOffset }
      : {}),
  };
}
export function setObjectSize(
  object: EmbroideryObject,
  width: number,
  height: number,
) {
  const box = bounds(object.paths),
    w = box.maxX - box.minX,
    h = box.maxY - box.minY;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    w < 0.001 ||
    h < 0.001 ||
    width < 0.1 ||
    height < 0.1
  )
    throw new Error("This geometry cannot be resized on that axis.");
  return transformObject(object, (p) => {
    const x = box.minX + ((p.x - box.minX) / w) * width;
    const y = box.minY + ((p.y - box.minY) / h) * height;
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error(
        "The resized coordinates exceed numeric precision. Choose a smaller scale.",
      );
    return { x, y };
  });
}
export function createPrimitive(
  kind: "rectangle" | "ellipse" | "line",
  start: Point,
  end: Point,
): Partial<EmbroideryObject> {
  const x = Math.min(start.x, end.x),
    y = Math.min(start.y, end.y),
    w = Math.abs(end.x - start.x),
    h = Math.abs(end.y - start.y);
  if (kind === "line")
    return {
      paths: [[start, end]],
      closed: [false],
      type: "run",
      underlay: false,
      pull: 0,
    };
  const points =
    kind === "rectangle"
      ? [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ]
      : Array.from(
          {
            length: Math.max(
              32,
              Math.min(720, Math.ceil((Math.PI * Math.max(w, h)) / 0.35)),
            ),
          },
          (_, i) => i,
        ).map((i, _, list) => ({
          x: x + w / 2 + (Math.cos((i / list.length) * Math.PI * 2) * w) / 2,
          y: y + h / 2 + (Math.sin((i / list.length) * Math.PI * 2) * h) / 2,
        }));
  return { paths: [points], closed: [true], type: "tatami" };
}

/** Split disconnected outer contours while assigning every hole to its smallest enclosing shell. */
export function separateElements(object: EmbroideryObject): EmbroideryObject[] {
  if (
    object.type === "satin-column" ||
    object.paths.length <= 1 ||
    object.closed.some((x) => !x)
  )
    return [object];
  const contours = object.paths.map((path, index) => ({
    path,
    index,
    area: Math.abs(signedArea(path)),
    box: bounds([path]),
    parent: -1,
    depth: 0,
  }));
  for (const contour of contours) {
    let smallest = Infinity;
    for (const other of contours)
      if (
        other.area > contour.area &&
        other.area < smallest &&
        other.box.minX <= contour.box.minX &&
        other.box.minY <= contour.box.minY &&
        other.box.maxX >= contour.box.maxX &&
        other.box.maxY >= contour.box.maxY &&
        inside(contour.path[0], [other.path], "evenodd")
      ) {
        contour.parent = other.index;
        smallest = other.area;
      }
  }
  const children = new Map<number, typeof contours>();
  for (const c of contours.slice().sort((a, b) => b.area - a.area)) {
    c.depth = c.parent < 0 ? 0 : contours[c.parent].depth + 1;
    const list = children.get(c.parent) ?? [];
    list.push(c);
    children.set(c.parent, list);
  }
  // Nonzero SVG overlap can imply a union rather than holes. Preserve that geometry.
  if (
    object.fillRule === "nonzero" &&
    contours.some(
      (c) =>
        c.parent >= 0 &&
        Math.sign(signedArea(c.path)) ===
          Math.sign(signedArea(contours[c.parent].path)),
    )
  )
    return [object];
  return contours
    .filter((c) => c.depth % 2 === 0)
    .map((shell, i) => ({
      ...object,
      id: `${object.id}-element-${i}`,
      name: `${object.name} · ${i + 1}`,
      paths: [
        shell.path,
        ...(children.get(shell.index) ?? [])
          .filter((c) => c.depth % 2 === 1)
          .map((c) => c.path),
      ],
      closed: [
        true,
        ...(children.get(shell.index) ?? [])
          .filter((c) => c.depth % 2 === 1)
          .map(() => true),
      ],
    }));
}
export type ColorBreakdown = {
  color: string;
  objectIds: string[];
  stitches: number;
  threadMM: number;
  areaMM2: number;
};
export function analyzeColors(
  project: Project,
  plan: StitchPlan | null,
): ColorBreakdown[] {
  const colors = new Map<string, ColorBreakdown>();
  for (const object of project.objects.filter((o) => o.visible)) {
    const record = colors.get(object.color) ?? {
      color: object.color,
      objectIds: [],
      stitches: 0,
      threadMM: 0,
      areaMM2: 0,
    };
    record.objectIds.push(object.id);
    // Deterministic scanline quadrature respects holes and overlapping compound contours.
    const paths = outlinePaths(object),
      box = bounds(paths);
    if (
      !object.closed.some((c) => !c) ||
      ["satin-column", "column-c"].includes(object.type)
    ) {
      const step = Math.max(0.2, (box.maxY - box.minY) / 300);
      for (let y = box.minY + step / 2; y < box.maxY; y += step)
        for (const [a, b] of scanArea(paths, y, object.fillRule))
          record.areaMM2 += (b - a) * step;
    }
    colors.set(object.color, record);
  }
  plan?.stitches.forEach((stitch, i) => {
    if (stitch.command !== "stitch") return;
    const record = colors.get(stitch.color);
    if (record) {
      record.stitches++;
      if (i) record.threadMM += distance(plan.stitches[i - 1], stitch);
    }
  });
  return [...colors.values()];
}
import { scanline as scanArea } from "./geometry";

export function designFingerprint(project: Project): string {
  // Stable, non-security identifier so a passed sew-out cannot certify subsequent edits.
  const text = JSON.stringify({
    engine: "threadform-0.10",
    width: project.width,
    height: project.height,
    fabric: project.fabric,
    hoopWidth: project.hoopWidth,
    hoopHeight: project.hoopHeight,
    trimDistance: project.trimDistance ?? 0,
    workspaceMode: project.workspaceMode ?? "hoop",
    autoStart: project.autoStart ?? "center",
    autoEnd: project.autoEnd ?? "last",
    startPoint: project.startPoint,
    endPoint: project.endPoint,
    machine: project.machine,
    objects: project.objects.map((object) => ({
      paths: object.paths,
      entryPoint: object.entryPoint,
      exitPoint: object.exitPoint,
      pauseAfter: object.pauseAfter,
      sequinMode: object.sequinMode,
      closed: object.closed,
      fillRule: object.fillRule,
      type: object.type,
      columnKind: object.columnKind,
      columnOffset: object.columnOffset,
      keepLastStitch: object.keepLastStitch,
      color: object.color,
      angle: object.angle,
      spacing: object.spacing,
      length: object.length,
      underlay: object.underlay,
      pull: object.pull,
      sewEnabled: object.sewEnabled ?? object.visible,
      artworkRole: object.artworkRole,
      underlayKind: object.underlayKind ?? "fill",
      underlays: object.underlays,
      satinMaxLength: object.satinMaxLength ?? 7,
      patternSize: object.patternSize ?? 4,
      satinLayers: object.satinLayers ?? 3,
      crossSize: object.crossSize ?? object.patternSize ?? 2,
      crossOrder: object.crossOrder ?? "english",
      crossTop: object.crossTop ?? "slash",
      crossRepeats: object.crossRepeats ?? 1,
      motif: object.motif ?? "diamond",
      lineWidth: object.lineWidth ?? 3,
      tieIn: object.tieIn !== false,
      tieOut: object.tieOut !== false,
      underlayInset: object.underlayInset ?? 0.65,
      tatamiOffset: object.tatamiOffset ?? 0.25,
      tatamiMinStitch: object.tatamiMinStitch ?? 0.5,
      spacingEnd: object.spacingEnd ?? object.spacing,
      forceTrim: !!object.forceTrim,
      splitPattern: object.splitPattern ?? "diamond",
      customPattern: object.customPattern,
      edgeEffect: object.edgeEffect ?? "none",
      effectDepth: object.effectDepth ?? 0.6,
      repeatCount: object.repeatCount ?? 2,
      connector: object.connector ?? "auto",
      thread: object.thread,
    })),
  });
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function emptyProject(): Project {
  return {
    version: 1,
    name: "Untitled design",
    width: 160,
    height: 160,
    hoopWidth: 200,
    hoopHeight: 200,
    workspaceMode: "freeform",
    fabric: "linen",
    objects: [],
    notes: [],
    source: "manual",
  };
}
