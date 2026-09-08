import type { EmbroideryObject, UnderlayLayer } from "./types";

export const UNDERLAY_METHODS = [
  { value: "center", label: "Center Run" },
  { value: "edge", label: "Edge Run" },
  { value: "zigzag", label: "Zigzag" },
  { value: "double-zigzag", label: "Double Zigzag" },
  { value: "tatami", label: "Tatami" },
] as const;
export function underlayLayer(
  kind: UnderlayLayer["kind"],
  id = "underlay-1",
): UnderlayLayer {
  return {
    id,
    kind,
    enabled: true,
    spacing: kind === "tatami" ? 2.2 : 1.8,
    length: kind === "edge" || kind === "center" ? 2 : 3,
    inset: kind === "center" ? 0 : 0.65,
    angle: kind === "tatami" ? 90 : 0,
  };
}
/** Read legacy presets without replacing their editable object properties. */
export function objectUnderlays(object: EmbroideryObject): UnderlayLayer[] {
  if (object.underlays) return object.underlays;
  const column = ["satin-column", "column-c"].includes(object.type);
  const legacy = object.underlayKind ?? (column ? "center" : "fill");
  const kind = legacy === "fill" || legacy === "cross" ? "tatami" : legacy;
  const first = {
    ...underlayLayer(kind),
    inset: object.underlayInset ?? (column ? 0 : 0.65),
  };
  return legacy === "cross"
    ? [first, { ...first, id: "underlay-2", angle: 180 }]
    : [first];
}
export function validateUnderlays(raw: unknown): UnderlayLayer[] {
  if (!Array.isArray(raw)) throw new Error("Invalid underlay layers.");
  const ids = new Set<string>();
  return raw.map((value) => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid underlay layer.");
    const r = value as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || r.id.length > 100 || ids.has(r.id))
      throw new Error("Underlay layer identifiers must be unique.");
    ids.add(r.id);
    if (
      !UNDERLAY_METHODS.some((m) => m.value === r.kind) ||
      typeof r.enabled !== "boolean"
    )
      throw new Error("Invalid underlay method.");
    for (const [key, min, max] of [
      ["spacing", 0.1, 50],
      ["length", 0.1, 12],
      ["inset", 0, 100],
      ["angle", -360, 360],
    ] as const)
      if (
        typeof r[key] !== "number" ||
        !Number.isFinite(r[key]) ||
        (r[key] as number) < min ||
        (r[key] as number) > max
      )
        throw new Error("Invalid underlay " + key + ".");
    return {
      id: r.id,
      kind: r.kind as UnderlayLayer["kind"],
      enabled: r.enabled,
      spacing: r.spacing as number,
      length: r.length as number,
      inset: r.inset as number,
      angle: r.angle as number,
    };
  });
}
