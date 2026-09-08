import { isSewingObject } from "./sewing-input";
import { deltaE2000 } from "./color-difference";
import { EFFECT_RUNS } from "./effects";
import { bounds, distance } from "./geometry";
import { outlinePaths } from "./operations";
import {
  type EmbroideryObject,
  type Point,
  type Project,
  type StitchPlan,
} from "./types";

export type OptimizeOptions = {
  metric?: "de2000" | "de76";
  preserveContrast?: boolean;
  sequence: boolean;
  nearest: boolean;
  trimDistance: number;
  mergeColors: boolean;
  tolerance: number;
  protectedColors: string[];
  removeOverlaps: boolean;
  allowance: number;
};
export const DEFAULT_OPTIMIZE: OptimizeOptions = {
  metric: "de2000",
  preserveContrast: true,
  sequence: true,
  nearest: true,
  trimDistance: 2.5,
  mergeColors: false,
  tolerance: 4,
  protectedColors: [],
  removeOverlaps: false,
  allowance: 0.3,
};
export type ColorMapping = {
  from: string;
  to: string;
  delta: number;
  objects: number;
  protected: boolean;
};
export type SequenceResult = {
  project: Project;
  constraints: number;
  reversed: number;
  moved: number;
  mapping: ColorMapping[];
};

/** sRGB → CIELAB, D65/2°. ΔE76 is a colour-distance heuristic, not a thread match. */
export function colorLab(hex: string): [number, number, number] {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = rgb;
  const xyz = [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883,
  ];
  const [x, y, z] = xyz.map((c) =>
    c > 216 / 24389 ? Math.cbrt(c) : ((24389 / 27) * c + 16) / 116,
  );
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function colorDifference(a: string, b: string) {
  const x = colorLab(a),
    y = colorLab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
export function perceptualDifference(a: string, b: string) {
  return deltaE2000(colorLab(a), colorLab(b));
}
export function mapColors(
  project: Project,
  options: OptimizeOptions,
): ColorMapping[] {
  const counts = new Map<string, number>();
  const protectedColors = new Set(
    options.protectedColors.map((c) => c.toLowerCase()),
  );
  for (const object of project.objects) {
    if (!isSewingObject(object)) continue;
    const color = object.color.toLowerCase();
    counts.set(color, (counts.get(color) ?? 0) + 1);
    if (object.locked || object.colorLocked) protectedColors.add(color);
  }
  const sorted = [...counts].sort(
    (a, b) =>
      Number(protectedColors.has(b[0])) - Number(protectedColors.has(a[0])) ||
      b[1] - a[1] ||
      a[0].localeCompare(b[0]),
  );
  const contacts = new Map<string, Set<string>>();
  if (options.preserveContrast !== false) {
    const active = project.objects.filter((o) => isSewingObject(o));
    const boxes = active.map(envelope);
    for (let i = 0; i < active.length; i++)
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i].color.toLowerCase(),
          b = active[j].color.toLowerCase();
        if (a !== b && overlap(boxes[i], boxes[j])) {
          if (!contacts.has(a)) contacts.set(a, new Set());
          if (!contacts.has(b)) contacts.set(b, new Set());
          contacts.get(a)!.add(b);
          contacts.get(b)!.add(a);
        }
      }
  }
  const retained: string[] = [];
  const members = new Map<string, string[]>();
  return sorted.map(([from, objects]) => {
    const protectedColor = protectedColors.has(from);
    let to = from,
      delta = Infinity;
    if (options.mergeColors && !protectedColor)
      for (const candidate of retained) {
        if (
          options.preserveContrast !== false &&
          (members.get(candidate) ?? [candidate]).some((c) =>
            contacts.get(from)?.has(c),
          )
        )
          continue;
        const difference =
          options.metric === "de76"
            ? colorDifference(from, candidate)
            : perceptualDifference(from, candidate);
        if (difference <= options.tolerance && difference < delta) {
          to = candidate;
          delta = difference;
        }
      }
    if (to === from) retained.push(from);
    members.set(to, [...(members.get(to) ?? []), from]);
    return {
      from,
      to,
      delta: to === from ? 0 : delta,
      objects,
      protected: protectedColor,
    };
  });
}

function envelope(object: EmbroideryObject) {
  const box = bounds(outlinePaths(object));
  const extra = EFFECT_RUNS.includes(object.type)
    ? (object.lineWidth ?? 3)
    : object.type === "blanket"
      ? (object.lineWidth ?? 3)
      : object.type === "zigzag"
        ? (object.lineWidth ?? 3) / 2
        : object.pull;
  return {
    minX: box.minX - extra - 0.1,
    maxX: box.maxX + extra + 0.1,
    minY: box.minY - extra - 0.1,
    maxY: box.maxY + extra + 0.1,
  };
}
function overlap(
  a: ReturnType<typeof envelope>,
  b: ReturnType<typeof envelope>,
) {
  return (
    a.maxX >= b.minX && b.maxX >= a.minX && a.maxY >= b.minY && b.maxY >= a.minY
  );
}
export function planMetrics(plan: StitchPlan) {
  return {
    stitches: plan.stitchCount,
    trims: plan.trimCount,
    colors: plan.colorChanges,
    travel: plan.jumpMM,
    minutes: plan.estimatedMinutes,
  };
}
export function sequenceProject(
  project: Project,
  options: OptimizeOptions,
  baseline: StitchPlan,
): SequenceResult {
  const mapping = mapColors(project, options),
    byColor = new Map(mapping.map((m) => [m.from, m.to]));
  const source = project.objects.map((o) =>
    o.locked || !isSewingObject(o)
      ? o
      : {
          ...o,
          color: byColor.get(o.color.toLowerCase()) ?? o.color,
          ...(byColor.get(o.color.toLowerCase()) !== o.color.toLowerCase()
            ? { thread: undefined }
            : {}),
        },
  );
  const n = source.length,
    edges = Array.from({ length: n }, () => new Set<number>()),
    degree = Array(n).fill(0) as number[];
  const boxes = source.map(envelope);
  const barrier = (o: EmbroideryObject) => o.locked || !isSewingObject(o);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      // A conservative expanded bounding box keeps every possible stitched overlap
      // in its original order. Locks are absolute barriers. Group order is sacred.
      if (
        !options.sequence ||
        barrier(source[i]) ||
        barrier(source[j]) ||
        (source[i].groupId && source[i].groupId === source[j].groupId) ||
        overlap(boxes[i], boxes[j])
      ) {
        edges[i].add(j);
        degree[j]++;
      }
    }
  const points = new Map<string, { entry: Point; exit: Point }>();
  for (const block of baseline.blocks) {
    const commands = baseline.stitches.slice(block.start, block.end);
    const entry = commands.find(
        (s) => s.command === "jump" || s.command === "stitch",
      ),
      exit = commands
        .slice()
        .reverse()
        .find((s) => s.command === "stitch");
    if (entry && exit) points.set(block.objectId, { entry, exit });
  }
  const ends = (o: EmbroideryObject) =>
    points.get(o.id) ?? {
      entry: o.paths[0]?.[0] ?? { x: 0, y: 0 },
      exit: o.paths.at(-1)?.at(-1) ?? { x: 0, y: 0 },
    };
  const reversible = (o: EmbroideryObject) =>
    options.nearest &&
    !o.locked &&
    !o.directionLocked &&
    !o.entryPoint &&
    !o.exitPoint &&
    !o.pauseAfter &&
    !o.sequinMode &&
    ["run", "triple"].includes(o.type) &&
    o.paths.length === 1 &&
    !o.closed[0];
  const result: EmbroideryObject[] = [],
    pending = new Set(Array.from({ length: n }, (_, i) => i));
  let current: Point = { x: project.width / 2, y: project.height / 2 },
    color = "",
    reversed = 0;
  while (pending.size) {
    const ready = [...pending].filter((i) => degree[i] === 0);
    if (!ready.length)
      throw new Error("The sewing constraints could not be resolved.");
    ready.sort((i, j) => {
      const a = source[i],
        b = source[j];
      if (options.sequence) {
        const difference =
          Number(b.color === color) - Number(a.color === color);
        if (difference) return difference;
      }
      if (options.nearest) {
        const cost = (o: EmbroideryObject) =>
          Math.min(
            distance(current, ends(o).entry),
            reversible(o) ? distance(current, ends(o).exit) : Infinity,
          );
        const delta = cost(a) - cost(b);
        if (Math.abs(delta) > 0.001) return delta;
      }
      return i - j;
    });
    const index = ready[0];
    let object = source[index];
    const locations = ends(object);
    if (
      reversible(object) &&
      distance(current, locations.exit) + 0.05 <
        distance(current, locations.entry)
    ) {
      object = {
        ...object,
        paths: object.paths.map((path) => [...path].reverse()),
      };
      current = locations.entry;
      reversed++;
    } else current = locations.exit;
    if (isSewingObject(object)) color = object.color;
    result.push(object);
    pending.delete(index);
    edges[index].forEach((j) => degree[j]--);
  }
  return {
    project: {
      ...project,
      objects: result,
      trimDistance: options.trimDistance,
    },
    constraints: edges.reduce((sum, set) => sum + set.size, 0),
    reversed,
    moved: result.filter((o, i) => o.id !== project.objects[i].id).length,
    mapping,
  };
}
