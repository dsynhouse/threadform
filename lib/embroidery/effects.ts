import { bounds, rotate } from "./geometry";
import { pathSampler } from "./digitizing";
import type { EmbroideryObject, Point } from "./types";

export const EFFECT_RUNS = [
  "stem",
  "chain",
  "candlewick",
  "coil-run",
  "motif-run",
];
export const EFFECT_FILLS = ["spiral", "ripple", "meander", "coil-fill"];
export const SPLIT_PATTERNS = [
  "brick",
  "diamond",
  "chevron",
  "wave",
  "basket",
  "scales",
  "custom",
] as const;
export function motifTile(object: EmbroideryObject): Point[][] {
  if (object.customPattern?.length) return object.customPattern;
  if (object.motif === "chevron")
    return [
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 1 },
        { x: 1, y: 0 },
      ],
    ];
  if (object.motif === "star")
    return [
      Array.from({ length: 11 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 0.2 : 0.48;
        return { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r };
      }),
    ];
  return [
    [
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 0, y: 0.5 },
    ],
  ];
}

export function* effectRun(
  object: EmbroideryObject,
  path: Point[],
): Generator<Point[]> {
  const sampler = pathSampler(path),
    pitch = object.patternSize ?? 4,
    width = object.lineWidth ?? 3;
  const count = Math.ceil(sampler.total / pitch);
  if (count > 20000 || count * path.length > 30000000)
    throw new Error(
      "Run pattern exceeds the detail budget. Increase pattern size.",
    );
  const along = (d: number, normal: number) => {
    const p = sampler.at(d),
      a = sampler.at(d - 0.05),
      b = sampler.at(d + 0.05),
      l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return {
      x: p.x - ((b.y - a.y) / l) * normal,
      y: p.y + ((b.x - a.x) / l) * normal,
    };
  };
  const continuous: Point[] = [];
  let motifExit: number | undefined;
  for (let i = 0; i < count; i++) {
    const d = i * pitch,
      step = Math.min(pitch, sampler.total - d);
    if (object.type === "stem")
      continuous.push(
        along(d, 0),
        along(d + step, 0),
        along(d + step * 0.35, width * 0.22),
      );
    else if (object.type === "motif-run") {
      for (const tile of motifTile(object)) {
        if (tile.length < 2) continue;
        const points = tile.map((p) =>
          along(d + p.x * step, (p.y - 0.5) * width),
        );
        if (object.connector && object.connector !== "auto") yield points;
        else {
          const entry = d + tile[0].x * step;
          if (motifExit !== undefined)
            continuous.push(...sampler.slice(motifExit, entry));
          continuous.push(...points);
          motifExit = d + tile[tile.length - 1].x * step;
        }
      }
    } else if (object.type === "candlewick") {
      continuous.push(along(d, 0));
      for (let r = 0; r < (object.repeatCount ?? 2); r++)
        for (const [x, y] of [
          [-0.18, 0],
          [0.18, 0],
          [0, -0.18],
          [0, 0.18],
          [0, 0],
        ])
          continuous.push(along(d + x * step, y * width));
    } else {
      const steps = Math.max(
        24,
        Math.ceil((Math.PI * width) / Math.min(0.4, object.length / 3)),
      );
      for (let j = 0; j <= steps; j++) {
        const t = j / steps,
          angle = t * Math.PI * 2;
        if (object.type === "coil-run")
          continuous.push(
            along(
              d + t * step - Math.sin(angle) * width * 0.3,
              Math.sin(angle / 2) * Math.sin(angle) * width * 0.5,
            ),
          );
        else
          continuous.push(
            along(
              d + ((1 - Math.cos(angle)) * step) / 2,
              Math.sin(angle) * width * 0.5,
            ),
          );
      }
      if (object.type === "chain") continuous.push(along(d + step, 0));
    }
  }
  if (continuous.length > 1) {
    if (motifExit !== undefined)
      continuous.push(...sampler.slice(motifExit, sampler.total));
    else continuous.push(along(sampler.total, 0));
    yield continuous;
  }
}

/** Pattern split locations are globally anchored in the rotated fill plane;
 * needle penetrations form the motif without reducing row coverage. */
export function splitPositions(
  o: EmbroideryObject,
  left: number,
  right: number,
  y: number,
  row: number,
): number[] {
  const size = o.patternSize ?? 4,
    phase = (((y / size) % 1) + 1) % 1,
    pattern = o.splitPattern ?? "diamond";
  const firstTile = Math.floor(left / size) - 1,
    lastTile = Math.ceil(right / size);
  if (
    size <= 0 ||
    !Number.isSafeInteger(firstTile) ||
    !Number.isSafeInteger(lastTile) ||
    lastTile - firstTile > 350000
  )
    throw new Error(
      "Program split exceeds the needle-path budget or coordinate precision. Increase pattern size or divide the region.",
    );
  let shifts: number[];
  switch (pattern) {
    case "brick":
      shifts = [(Math.floor(y / size) % 2) * 0.5];
      break;
    case "diamond":
      shifts = [phase, 1 - phase];
      break;
    case "chevron":
      shifts = [Math.abs(phase * 2 - 1)];
      break;
    case "wave":
      shifts = [0.5 + 0.45 * Math.sin(phase * Math.PI * 2)];
      break;
    case "basket":
      shifts = [Math.floor(y / size) % 2 ? 0.25 : 0.75];
      break;
    case "scales":
      shifts = [
        0.5 - Math.sqrt(Math.max(0, 0.25 - (phase - 0.5) ** 2)),
        0.5 + Math.sqrt(Math.max(0, 0.25 - (phase - 0.5) ** 2)),
      ];
      break;
    case "custom":
      shifts = [];
      for (const path of o.customPattern ?? motifTile(o))
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1],
            b = path[i];
          if ((a.y <= phase && b.y > phase) || (b.y <= phase && a.y > phase))
            shifts.push(a.x + ((phase - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      break;
  }
  if ((lastTile - firstTile + 1) * shifts.length > 350000)
    throw new Error(
      "Program split exceeds the needle-path budget. Simplify the tile or increase pattern size.",
    );
  const points = [left, right];
  for (let tile = firstTile; tile <= lastTile; tile++)
    for (const x of shifts) {
      const p = (tile + x) * size;
      if (p > left + 0.15 && p < right - 0.15) points.push(p);
    }
  points.sort((a, b) => a - b);
  const unique = points.filter(
    (x, i) => !i || i === points.length - 1 || x - points[i - 1] > 0.15,
  );
  return row % 2 ? unique.reverse() : unique;
}

/** Deterministic geometric lockstitch effects; clipping is performed by caller. */
export function* effectFill(
  o: EmbroideryObject,
  paths: Point[][],
): Generator<Point[]> {
  const angle = (o.angle * Math.PI) / 180,
    local = paths.map((p) => p.map((v) => rotate(v, -angle))),
    b = bounds(local);
  const cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2,
    radius = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2;
  const spacing = Math.max(0.2, o.spacing),
    size = o.patternSize ?? 4;
  const rotatePath = (p: Point[]) => p.map((v) => rotate(v, angle));
  if (o.type === "spiral" || o.type === "ripple") {
    const turns = Math.ceil(radius / spacing),
      work = Math.ceil((Math.PI * radius * radius) / spacing / 0.3);
    if (work > 160000)
      throw new Error(
        "Radial effect is too detailed. Increase row spacing or use a smaller region.",
      );
    if (o.type === "spiral") {
      const p: Point[] = [];
      let theta = 0;
      while (theta < turns * Math.PI * 2) {
        const r = (spacing * theta) / (Math.PI * 2);
        p.push({ x: cx + Math.cos(theta) * r, y: cy + Math.sin(theta) * r });
        theta += Math.min(0.15, 0.3 / Math.max(0.3, r));
      }
      yield rotatePath(p);
    } else
      for (let r = spacing / 2; r < radius; r += spacing) {
        const n = Math.max(16, Math.ceil((Math.PI * 2 * r) / 0.3));
        yield rotatePath(
          Array.from({ length: n + 1 }, (_, i) => ({
            x: cx + Math.cos((i / n) * Math.PI * 2) * r,
            y: cy + Math.sin((i / n) * Math.PI * 2) * r,
          })),
        );
      }
  } else {
    const rowGap =
        o.type === "coil-fill" ? size * 0.8 : Math.max(spacing, size * 0.5),
      n = Math.ceil((b.maxX - b.minX + size * 2) / 0.25);
    if (n * Math.ceil((b.maxY - b.minY + size * 2) / rowGap) > 100000)
      throw new Error("Pattern is too detailed. Increase pattern size.");
    let row = 0;
    for (let y = b.minY - size; y < b.maxY + size; y += rowGap, row++) {
      const p: Point[] = [];
      for (let j = 0; j <= n; j++) {
        const x = b.minX - size + j * 0.25,
          t = ((x - b.minX) / size) * Math.PI * 2;
        p.push(
          o.type === "coil-fill"
            ? {
                x: x + Math.cos(t) * size * 0.42,
                y: y + Math.sin(t) * size * 0.42,
              }
            : {
                x,
                y:
                  y +
                  Math.sin(t) * size * 0.2 +
                  Math.sin(t * 0.5 + row) * size * 0.1,
              },
        );
      }
      if (row % 2) p.reverse();
      yield rotatePath(p);
    }
  }
}
