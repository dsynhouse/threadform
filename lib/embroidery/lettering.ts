import { makeObject, type EmbroideryObject, type Point } from "./types";
import { assertGeometryBudget, GEOMETRY_BUDGET } from "./complexity";
// Original single-line glyph geometry on a 4 × 6 grid; deliberately not a filled embroidery font.
const glyphs: Record<string, string> = {
  A: "0,6 2,0 4,6|1,3 3,3",
  B: "0,6 0,0 3,0 4,1 4,2 3,3 0,3|3,3 4,4 4,5 3,6 0,6",
  C: "4,0 1,0 0,1 0,5 1,6 4,6",
  D: "0,6 0,0 2,0 4,2 4,4 2,6 0,6",
  E: "4,0 0,0 0,6 4,6|0,3 3,3",
  F: "0,6 0,0 4,0|0,3 3,3",
  G: "4,0 1,0 0,1 0,5 1,6 4,6 4,3 2,3",
  H: "0,0 0,6|4,0 4,6|0,3 4,3",
  I: "0,0 4,0|2,0 2,6|0,6 4,6",
  J: "0,0 4,0 4,5 3,6 1,6 0,5",
  K: "0,0 0,6|4,0 0,3 4,6",
  L: "0,0 0,6 4,6",
  M: "0,6 0,0 2,3 4,0 4,6",
  N: "0,6 0,0 4,6 4,0",
  O: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0",
  P: "0,6 0,0 3,0 4,1 4,2 3,3 0,3",
  Q: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|2,4 4,6",
  R: "0,6 0,0 3,0 4,1 4,2 3,3 0,3|2,3 4,6",
  S: "4,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 0,6",
  T: "0,0 4,0|2,0 2,6",
  U: "0,0 0,5 1,6 3,6 4,5 4,0",
  V: "0,0 2,6 4,0",
  W: "0,0 1,6 2,3 3,6 4,0",
  X: "0,0 4,6|4,0 0,6",
  Y: "0,0 2,3 4,0|2,3 2,6",
  Z: "0,0 4,0 0,6 4,6",
  "0": "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|0,5 4,1",
  "1": "1,1 2,0 2,6|0,6 4,6",
  "2": "0,1 1,0 3,0 4,1 4,2 0,6 4,6",
  "3": "0,0 4,0 2,3 4,4 4,5 3,6 0,6",
  "4": "3,6 3,0 0,4 4,4",
  "5": "4,0 0,0 0,3 3,3 4,4 4,5 3,6 0,6",
  "6": "4,0 1,0 0,2 0,5 1,6 3,6 4,5 4,4 3,3 0,3",
  "7": "0,0 4,0 1,6",
  "8": "1,0 3,0 4,1 4,2 3,3 1,3 0,2 0,1 1,0|1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3",
  "9": "4,3 1,3 0,2 0,1 1,0 3,0 4,1 4,5 3,6 0,6",
  "-": "0,3 4,3",
  ".": "2,5.8 2,6",
};
export function createLettering(
  text: string,
  height: number,
  start: Point,
  color: string,
  id: string,
): EmbroideryObject[] {
  if (!Number.isFinite(height) || height <= 0)
    throw new Error("Use a positive, finite letter height.");
  if (text.length * 8 > GEOMETRY_BUDGET)
    throw new Error("This text exceeds the vector processing budget.");
  const normalized = text.toUpperCase();
  if ([...normalized].some((c) => c !== " " && !glyphs[c]))
    throw new Error(
      "Single-line lettering supports A–Z, 0–9, spaces, hyphens and periods. Import outlined SVG for other typefaces.",
    );
  const scale = height / 6;
  const objects = [...normalized].flatMap((character, index) => {
    if (character === " ") return [];
    const paths = glyphs[character].split("|").map((stroke) =>
      stroke.split(" ").map((pair) => {
        const [x, y] = pair.split(",").map(Number);
        return {
          x: start.x + (index * 5.5 + x) * scale,
          y: start.y + y * scale,
        };
      }),
    );
    return [
      makeObject({
        id: `${id}-${index}`,
        name: `Letter ${character}`,
        groupId: id,
        paths,
        closed: paths.map(() => false),
        type: "triple",
        color,
        length: Math.max(0.4, Math.min(2, height / 3)),
        underlay: false,
        pull: 0,
      }),
    ];
  });
  assertGeometryBudget(objects);
  return objects;
}
