/** CIEDE2000, kL = kC = kH = 1. Original implementation of the published
 * formula, validated against Sharma, Wu & Dalal's supplementary pairs.
 * sRGB-derived Lab is useful for palette decisions, not calibrated thread matching. */
export function deltaE2000(a: readonly number[], b: readonly number[]): number {
  if (
    a.length !== 3 ||
    b.length !== 3 ||
    [...a, ...b].some((v) => !Number.isFinite(v))
  )
    throw new Error("Colour comparison requires finite Lab triplets.");
  const rad = Math.PI / 180;
  const [l1, a1, b1] = a,
    [l2, a2, b2] = b;
  const c = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1,
    ap2 = (1 + g) * a2;
  const c1 = Math.hypot(ap1, b1),
    c2 = Math.hypot(ap2, b2);
  const hue = (x: number, y: number) => (Math.atan2(y, x) / rad + 360) % 360;
  const h1 = c1 ? hue(ap1, b1) : 0,
    h2 = c2 ? hue(ap2, b2) : 0;
  const dl = l2 - l1,
    dc = c2 - c1;
  let dh = h2 - h1;
  if (!c1 || !c2) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh * rad) / 2);
  const lm = (l1 + l2) / 2,
    cm = (c1 + c2) / 2;
  let hm = h1 + h2;
  if (c1 && c2) {
    if (Math.abs(h1 - h2) <= 180) hm /= 2;
    else hm = (hm + (hm < 360 ? 360 : -360)) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const sl = 1 + (0.015 * (lm - 50) ** 2) / Math.sqrt(20 + (lm - 50) ** 2);
  const sc = 1 + 0.045 * cm,
    sh = 1 + 0.015 * cm * t;
  const rt =
    -2 *
    Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  const x = dl / sl,
    y = dc / sc,
    z = dH / sh;
  return Math.sqrt(Math.max(0, x * x + y * y + z * z + rt * y * z));
}
