import { simplify } from "./geometry";
import type { Point } from "./types";

/** Zhang-Suen thinning followed by graph walking. Each skeleton edge is visited
 * once; junctions become separate paths so no invisible connecting line is sewn. */
export function traceCenterlines(
  labels: Int16Array,
  w: number,
  h: number,
  color: number,
  tolerance: number,
): Point[][] {
  if (w * h > 768 * 768)
    throw new Error(
      "Centreline tracing supports up to 768 pixels on the longest edge.",
    );
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = labels[i] === color ? 1 : 0;
  const offsets = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1];
  const neighbors = (i: number) =>
    offsets.map((o, j) => {
      const x = i % w,
        y = Math.floor(i / w),
        nx = x + [0, 1, 1, 1, 0, -1, -1, -1][j],
        ny = y + [-1, -1, 0, 1, 1, 1, 0, -1][j];
      return nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : mask[i + o];
    });
  let changed = true,
    iteration = 0;
  while (changed && iteration++ < 256) {
    changed = false;
    for (let phase = 0; phase < 2; phase++) {
      const remove: number[] = [];
      for (let i = 0; i < mask.length; i++)
        if (mask[i]) {
          const p = neighbors(i),
            n = p.reduce((s, v) => s + v, 0);
          if (n < 2 || n > 6) continue;
          let transitions = 0;
          for (let j = 0; j < 8; j++)
            if (!p[j] && p[(j + 1) % 8]) transitions++;
          if (transitions !== 1) continue;
          if (
            phase === 0
              ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6]
              : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]
          )
            continue;
          remove.push(i);
        }
      if (remove.length) changed = true;
      for (const i of remove) mask[i] = 0;
    }
  }
  if (changed)
    throw new Error(
      "The line art is too thick for centreline tracing. Use region contours or thinner artwork.",
    );
  const links = new Map<number, number[]>();
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      const p = neighbors(i);
      links.set(
        i,
        offsets.flatMap((o, j) => {
          if (!p[j]) return [];
          // Avoid diagonal shortcuts when an orthogonal route already exists.
          if (j % 2 && (p[(j + 7) % 8] || p[(j + 1) % 8])) return [];
          return [i + o];
        }),
      );
    }
  const visited = new Set<string>(),
    paths: Point[][] = [];
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const walk = (start: number, next: number) => {
    const result = [start];
    let prev = start,
      current = next;
    while (true) {
      visited.add(key(prev, current));
      result.push(current);
      const list = links.get(current) ?? [];
      if (list.length !== 2) break;
      const following = list.find((n) => n !== prev)!;
      if (visited.has(key(current, following))) break;
      prev = current;
      current = following;
    }
    const points = result.map((i) => ({
      x: (i % w) + 0.5,
      y: Math.floor(i / w) + 0.5,
    }));
    paths.push(simplify(points, tolerance));
  };
  for (const [i, list] of links)
    if (list.length !== 2)
      for (const next of list) if (!visited.has(key(i, next))) walk(i, next);
  for (const [i, list] of links)
    for (const next of list) if (!visited.has(key(i, next))) walk(i, next);
  return paths.filter((p) => p.length > 1);
}
