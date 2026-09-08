import {
  makeObject,
  type Project,
  type EmbroideryObject,
  type Point,
} from "./types";
import { bounds } from "./geometry";
import { validateProject } from "./project";
/** DST stores relative tenths of a millimetre, without design objects or RGB. */
export function decodeDSTDelta(a: number, b: number, c: number): Point {
  const bit = (v: number, n: number) => (v >> n) & 1;
  return {
    x:
      bit(a, 0) -
      bit(a, 1) +
      (bit(b, 0) - bit(b, 1)) * 3 +
      (bit(a, 2) - bit(a, 3)) * 9 +
      (bit(b, 2) - bit(b, 3)) * 27 +
      (bit(c, 2) - bit(c, 3)) * 81,
    y:
      bit(a, 7) -
      bit(a, 6) +
      (bit(b, 7) - bit(b, 6)) * 3 +
      (bit(a, 5) - bit(a, 4)) * 9 +
      (bit(b, 5) - bit(b, 4)) * 27 +
      (bit(c, 5) - bit(c, 4)) * 81,
  };
}
export function importDST(bytes: Uint8Array, name: string): Project {
  if (
    bytes.length < 515 ||
    new TextDecoder().decode(bytes.slice(0, 3)) !== "LA:"
  )
    throw new Error("This is not a supported DST file with a 512-byte header.");
  const displayColors = [
    "#21776a",
    "#c79647",
    "#2a4774",
    "#c26779",
    "#4d7061",
    "#574b67",
  ];
  const objects: EmbroideryObject[] = [];
  let paths: Point[][] = [],
    path: Point[] = [],
    x = 0,
    y = 0,
    color = 0,
    ended = false,
    points = 0;
  const flushPath = () => {
    if (path.length > 1) paths.push(path);
    path = [];
  };
  const flushObject = () => {
    flushPath();
    if (paths.length) {
      objects.push(
        makeObject({
          id: `dst-${objects.length}`,
          name: `DST colour block ${color + 1}`,
          color: displayColors[color % displayColors.length],
          paths,
          closed: paths.map(() => false),
          type: "manual",
          underlay: false,
          pull: 0,
          tieIn: false,
          tieOut: false,
          directionLocked: true,
          forceTrim: true,
        }),
      );
      paths = [];
    }
  };
  for (let i = 512; i + 2 < bytes.length; i += 3) {
    const a = bytes[i],
      b = bytes[i + 1],
      c = bytes[i + 2];
    if (c === 0xf3) {
      ended = true;
      break;
    }
    if ((c & 3) !== 3)
      throw new Error("DST contains an invalid command record.");
    if ((c & 0xc3) === 0xc3) {
      flushObject();
      color++;
      continue;
    }
    if ((c & 0x40) !== 0)
      throw new Error(
        "This DST contains specialty sequin-mode commands which this lockstitch editor cannot preserve.",
      );
    const d = decodeDSTDelta(a, b, c),
      prev = { x: x / 10, y: -y / 10 };
    x += d.x;
    y += d.y;
    if (c & 0x80) flushPath();
    else {
      if (!path.length) path.push(prev);
      path.push({ x: x / 10, y: -y / 10 });
      if (++points > 150000)
        throw new Error(
          "DST import exceeds 150,000 needle points. Split this design in machine software first.",
        );
    }
  }
  if (!ended)
    throw new Error("DST file is truncated or missing its end command.");
  flushObject();
  if (!objects.length) throw new Error("DST contains no sewable needle paths.");
  const b = bounds(objects.flatMap((o) => o.paths)),
    width = b.maxX - b.minX + 20,
    height = b.maxY - b.minY + 20;
  return validateProject({
    version: 1,
    name: name.replace(/\.dst$/i, ""),
    width,
    height,
    hoopWidth: width,
    hoopHeight: height,
    workspaceMode: "freeform",
    fabric: "linen",
    source: "manual",
    objects: objects.map((o) => ({
      ...o,
      paths: o.paths.map((p) =>
        p.map((v) => ({ x: v.x - b.minX + 10, y: v.y - b.minY + 10 })),
      ),
    })),
    notes: [
      "Imported DST needle paths. Display colours are placeholders: assign physical threads from the original colour sheet.",
      "DST does not retain source outlines, stitch types or a standard explicit trim command. Jumps separate manual paths; output trims are regenerated. Needle spans over 7 mm are split by this editor. Keep the original machine file.",
    ],
  });
}
