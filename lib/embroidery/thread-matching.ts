import { colorLab } from "./optimization";
import { deltaE2000 } from "./color-difference";
import type { Project, ThreadShade } from "./types";

export const threadKey = (shade: ThreadShade) =>
  JSON.stringify([shade.brand, shade.line, shade.code, shade.name]);
/** Compare the chart's display values. Measurements are retained as provenance,
 * never mixed across illuminants or presented as calibrated screen colours. */
export function rankThreads(hex: string, shades: ThreadShade[], limit = 5) {
  const target = colorLab(hex);
  return shades
    .map((shade) => ({
      shade,
      delta: deltaE2000(target, colorLab(shade.color)),
    }))
    .sort(
      (a, b) =>
        a.delta - b.delta ||
        threadKey(a.shade).localeCompare(threadKey(b.shade)),
    )
    .slice(0, limit);
}
export type ThreadMatch = {
  color: string;
  ids: string[];
  matches: ReturnType<typeof rankThreads>;
};
export function previewThreadMatches(
  project: Project,
  shades: ThreadShade[],
  ids: string[] = [],
  replaceAssigned = false,
): ThreadMatch[] {
  const selection = new Set(ids),
    groups = new Map<string, string[]>();
  for (const o of project.objects) {
    if (
      o.locked ||
      (o.thread && !replaceAssigned) ||
      (ids.length && !selection.has(o.id)) ||
      (o.artworkRole && o.artworkRole !== "embroidery")
    )
      continue;
    const key = o.color.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(o.id);
    groups.set(key, list);
  }
  return [...groups].map(([color, ids]) => ({
    color,
    ids,
    matches: rankThreads(color, shades),
  }));
}
export function applyThreadMatches(
  project: Project,
  review: ThreadMatch[],
  choices: Record<string, string>,
  replaceAssigned = false,
): Project {
  const assignments = new Map<string, { thread: ThreadShade; color: string }>();
  for (const row of review) {
    const chosen = row.matches.find(
      (m) => threadKey(m.shade) === choices[row.color],
    );
    if (chosen)
      for (const id of row.ids)
        assignments.set(id, { thread: chosen.shade, color: row.color });
  }
  return {
    ...project,
    objects: project.objects.map((o) => {
      const match = assignments.get(o.id);
      return match &&
        o.color.toLowerCase() === match.color &&
        !o.locked &&
        (!o.artworkRole || o.artworkRole === "embroidery") &&
        (!o.thread || replaceAssigned)
        ? { ...o, thread: match.thread, colorLocked: true }
        : o;
    }),
  };
}
