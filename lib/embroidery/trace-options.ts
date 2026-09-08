export type TraceOptions = {
  preservePixels?: boolean;
  smoothCurves?: boolean;
  islandAction?: "discard" | "merge";
  colors: number;
  resolution: number;
  minArea: number;
  removeWhite: boolean;
  backgroundMode?: "border" | "all-white";
  widthMM: number;
  palette?: string[];
  simplifyMM?: number;
  preserveHoles?: boolean;
  alphaThreshold?: number;
  whiteThreshold?: number;
  mode?: "regions" | "centerline";
};
export function validateTraceOptions(raw: unknown): TraceOptions {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid saved conversion settings.");
  const r = raw as Record<string, unknown>,
    result: Record<string, unknown> = {};
  for (const [key, min, max] of [
    ["colors", 1, 64],
    ["resolution", 1, 2048],
    ["minArea", 0, Infinity],
    ["widthMM", 1, Infinity],
    ["simplifyMM", 0, 1],
    ["alphaThreshold", 1, 255],
    ["whiteThreshold", 0, 255],
  ] as const) {
    const value = r[key];
    if (
      value === undefined &&
      ["simplifyMM", "alphaThreshold", "whiteThreshold"].includes(key)
    )
      continue;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw new Error("Invalid saved conversion setting: " + key);
    if (["colors", "resolution"].includes(key) && !Number.isInteger(value))
      throw new Error("Invalid saved conversion count.");
    result[key] = value;
  }
  if (typeof r.removeWhite !== "boolean")
    throw new Error("Invalid saved background treatment.");
  for (const key of [
    "removeWhite",
    "preservePixels",
    "smoothCurves",
    "preserveHoles",
  ])
    if (r[key] !== undefined) {
      if (typeof r[key] !== "boolean")
        throw new Error("Invalid saved conversion preference.");
      result[key] = r[key];
    }
  for (const [key, values] of [
    ["islandAction", ["discard", "merge"]],
    ["backgroundMode", ["border", "all-white"]],
    ["mode", ["regions", "centerline"]],
  ] as const)
    if (r[key] !== undefined) {
      if (!(values as readonly unknown[]).includes(r[key]))
        throw new Error("Invalid saved conversion mode.");
      result[key] = r[key];
    }
  if (r.palette !== undefined) {
    if (
      !Array.isArray(r.palette) ||
      r.palette.length > 64 ||
      r.palette.some((c) => typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c))
    )
      throw new Error("Invalid saved conversion palette.");
    result.palette = [...r.palette];
  }
  return result as TraceOptions;
}
