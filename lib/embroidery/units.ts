export type MeasurementUnit = "mm" | "in";
export const mmPerUnit = (unit: MeasurementUnit) => (unit === "in" ? 25.4 : 1);
export function measurementText(
  mm: number,
  unit: MeasurementUnit = "mm",
  digits = unit === "in" ? 4 : 2,
) {
  return String(Number((mm / mmPerUnit(unit)).toFixed(digits)));
}
/** Decimal, fractional and mixed measurements; no expression evaluation. */
export function parseMeasurement(
  text: string,
  unit: MeasurementUnit = "mm",
): number {
  const fractions: Record<string, string> = {
    "¼": " 1/4",
    "½": " 1/2",
    "¾": " 3/4",
    "⅛": " 1/8",
    "⅜": " 3/8",
    "⅝": " 5/8",
    "⅞": " 7/8",
  };
  const normalized = text
    .trim()
    .replace(/[¼½¾⅛⅜⅝⅞]/g, (c) => fractions[c])
    .trim();
  const match = normalized.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:\s+\d+\s*\/\s*\d+|\s*\/\s*\d+)?)\s*(mm|cm|in|inch|inches|["″])?$/i,
  );
  if (!match) return NaN;
  const numeric = match[1].replace(/\s*\/\s*/g, "/"),
    tokens = numeric.split(/\s+/);
  const fraction = (s: string) => {
    const [a, b] = s.split("/").map(Number);
    return b === undefined ? a : a / b;
  };
  const n =
    tokens.length === 2
      ? Number(tokens[0]) +
        (tokens[0].startsWith("-") ? -1 : 1) * fraction(tokens[1])
      : fraction(numeric);
  const suffix = match[2]?.toLowerCase();
  const scale =
    suffix === "mm"
      ? 1
      : suffix === "cm"
        ? 10
        : suffix
          ? 25.4
          : mmPerUnit(unit);
  const result = n * scale;
  return Number.isFinite(result) ? result : NaN;
}
