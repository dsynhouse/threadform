import { distance, lerp } from "./geometry";
import type { Point } from "./types";

export type DigitizingPoint = Point & { curve?: boolean };

/** Evaluate original nodes; flattening is derived geometry, never the editable master. */
export function curveSegment(nodes: Point[], i: number, closed = false) {
  const a = nodes[i],
    b = nodes[(i + 1) % nodes.length];
  const prev =
    nodes[closed ? (i - 1 + nodes.length) % nodes.length : Math.max(0, i - 1)];
  const next =
    nodes[closed ? (i + 2) % nodes.length : Math.min(nodes.length - 1, i + 2)];
  const chord = { x: b.x - a.x, y: b.y - a.y };
  const tangent = (p: Point, q: Point) => {
    const d = distance(p, q) || 1,
      length = Math.min(distance(a, b), d / 2);
    return { x: ((q.x - p.x) / d) * length, y: ((q.y - p.y) / d) * length };
  };
  const m0 = a.curve ? tangent(prev, b) : chord,
    m1 = b.curve ? tangent(a, next) : chord;
  const c1 = a.handleOut ?? { x: a.x + m0.x / 3, y: a.y + m0.y / 3 };
  const c2 = b.handleIn ?? { x: b.x - m1.x / 3, y: b.y - m1.y / 3 };
  const curved = !!(a.curve || b.curve || a.handleOut || b.handleIn);
  return {
    handleOut: c1,
    handleIn: c2,
    steps: curved
      ? Math.min(
          2000,
          Math.max(
            4,
            Math.ceil(
              (distance(a, c1) + distance(c1, c2) + distance(c2, b)) / 0.15,
            ),
          ),
        )
      : 1,
    at(t: number): Point {
      const u = 1 - t;
      return {
        x:
          u * u * u * a.x +
          3 * u * u * t * c1.x +
          3 * u * t * t * c2.x +
          t * t * t * b.x,
        y:
          u * u * u * a.y +
          3 * u * u * t * c1.y +
          3 * u * t * t * c2.y +
          t * t * t * b.y,
      };
    },
  };
}
export function digitizeCurve(
  nodes: DigitizingPoint[],
  closed = false,
): Point[] {
  if (nodes.length < 2) return nodes.map((p) => ({ x: p.x, y: p.y }));
  const result: Point[] = [{ x: nodes[0].x, y: nodes[0].y }];
  for (let i = 0; i < (closed ? nodes.length : nodes.length - 1); i++) {
    const segment = curveSegment(nodes, i, closed);
    if (result.length + segment.steps > 150000)
      throw new Error(
        "Curve processing budget reached. Divide this path before refining it.",
      );
    for (let j = 1; j <= segment.steps; j++)
      result.push(segment.at(j / segment.steps));
  }
  if (closed) result.pop();
  return result;
}
export function reverseCurve(path: Point[]): Point[] {
  return [...path].reverse().map(({ handleIn, handleOut, ...point }) => ({
    ...point,
    ...(handleOut ? { handleIn: handleOut } : {}),
    ...(handleIn ? { handleOut: handleIn } : {}),
  }));
}

export function pathSampler(path: Point[]) {
  const lengths = [0];
  for (let i = 1; i < path.length; i++)
    lengths.push(lengths[i - 1] + distance(path[i - 1], path[i]));
  const total = lengths.at(-1) ?? 0;
  return {
    total,
    slice(from: number, to: number): Point[] {
      const lo = Math.max(0, Math.min(total, Math.min(from, to)));
      const hi = Math.max(0, Math.min(total, Math.max(from, to)));
      const points = [
        this.at(lo),
        ...path.filter(
          (_, i) => lengths[i] > lo + 1e-8 && lengths[i] < hi - 1e-8,
        ),
        this.at(hi),
      ];
      return from <= to ? points : points.reverse();
    },
    at(d: number) {
      if (!path.length) return { x: 0, y: 0 };
      d = Math.max(0, Math.min(total, d));
      let lo = 1,
        hi = path.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (lengths[m] < d) lo = m + 1;
        else hi = m;
      }
      if (path.length < 2) return path[0];
      return lerp(
        path[lo - 1],
        path[lo],
        (d - lengths[lo - 1]) / (lengths[lo] - lengths[lo - 1] || 1),
      );
    },
  };
}

/** Column B synchronises independently drawn rails by normalised arc length. */
export function pairRails(
  left: Point[],
  right: Point[],
  followRight = false,
): Point[][] {
  if (left.length < 2 || right.length < 2)
    throw new Error("Draw at least two points on each column edge.");
  const same =
    distance(left[0], right[0]) + distance(left.at(-1)!, right.at(-1)!);
  const opposite =
    distance(left[0], right.at(-1)!) + distance(left.at(-1)!, right[0]);
  const a = pathSampler(
      opposite < same && followRight ? [...left].reverse() : left,
    ),
    b = pathSampler(
      opposite < same && !followRight ? [...right].reverse() : right,
    );
  const n = Math.min(
    12000,
    Math.max(2, Math.ceil(Math.max(a.total, b.total) / 0.2)),
  );
  return [a, b].map((s) =>
    Array.from({ length: n + 1 }, (_, i) => s.at((s.total * i) / n)),
  );
}

/** Column A shares interval parameters while each rail keeps its own corner/curve type. */
export function pairedCurveRails(nodes: DigitizingPoint[]): Point[][] {
  const left = nodes.filter((_, i) => i % 2 === 0),
    right = nodes.filter((_, i) => i % 2 === 1);
  if (left.length < 2 || left.length !== right.length)
    throw new Error("Column A needs complete left/right pairs.");
  const rails: Point[][] = [[], []];
  for (let i = 0; i < left.length - 1; i++) {
    const a = curveSegment(left, i),
      b = curveSegment(right, i),
      steps = Math.max(a.steps, b.steps);
    if ((rails[0].length + steps) * 2 > 150000)
      throw new Error(
        "Column curve processing budget reached. Divide this column.",
      );
    for (let j = i === 0 ? 0 : 1; j <= steps; j++) {
      rails[0].push(a.at(j / steps));
      rails[1].push(b.at(j / steps));
    }
  }
  return rails;
}

export function centrelineRails(
  path: Point[],
  width: number,
  offset = 0,
): Point[][] {
  const source = path.filter((p, i) => !i || distance(p, path[i - 1]) > 1e-8);
  if (source.length < 2) return [source.slice(), source.slice()];
  const closed = distance(source[0], source[source.length - 1]) < 1e-8;
  if (closed) source.pop();
  const normals = source.slice(0, closed ? source.length : -1).map((p, i) => {
    const q = source[(i + 1) % source.length],
      length = distance(p, q) || 1;
    return { x: -(q.y - p.y) / length, y: (q.x - p.x) / length };
  });
  const corners = source.map((p, i) => {
    const before =
      normals[
        closed ? (i - 1 + normals.length) % normals.length : Math.max(0, i - 1)
      ];
    const after = normals[Math.min(i, normals.length - 1)];
    const denominator = 1 + before.x * after.x + before.y * after.y;
    let dx: number, dy: number;
    if (denominator < 0.05) {
      dx = (after.x * width) / 2;
      dy = (after.y * width) / 2;
    } else {
      dx = ((before.x + after.x) * width) / 2 / denominator;
      dy = ((before.y + after.y) * width) / 2 / denominator;
    }
    const scale = Math.min(1, (width * 2) / (Math.hypot(dx, dy) || 1));
    dx *= scale;
    dy *= scale;
    return [
      {
        x: p.x + dx * (1 + (2 * offset) / width),
        y: p.y + dy * (1 + (2 * offset) / width),
      },
      {
        x: p.x - dx * (1 - (2 * offset) / width),
        y: p.y - dy * (1 - (2 * offset) / width),
      },
    ];
  });
  if (closed) corners.push(corners[0]);
  const rails: Point[][] = [[], []];
  // Interpolate between shared miter joins. Sampling normals immediately before
  // and after a corner folds the inside rail back over itself.
  for (let i = 1; i < corners.length; i++) {
    const steps = Math.max(
      1,
      Math.ceil(
        Math.max(
          distance(corners[i - 1][0], corners[i][0]),
          distance(corners[i - 1][1], corners[i][1]),
        ) / 0.2,
      ),
    );
    if (rails[0].length + steps > 30000)
      throw new Error(
        "This centreline column is too detailed. Simplify the path or divide the column.",
      );
    for (let j = i === 1 ? 0 : 1; j <= steps; j++) {
      rails[0].push(lerp(corners[i - 1][0], corners[i][0], j / steps));
      rails[1].push(lerp(corners[i - 1][1], corners[i][1], j / steps));
    }
  }
  return rails;
}
