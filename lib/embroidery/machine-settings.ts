import { isSewingObject } from "./sewing-input";
import type { Point, Project, StitchPlan, Issue } from "./types";

export function startOrigin(project: Project, first?: Point): Point {
  if (project.autoStart === "custom" && project.startPoint)
    return project.startPoint;
  if (project.autoStart === "first" && first) return { x: first.x, y: first.y };
  return { x: project.width / 2, y: project.height / 2 };
}
export function machinePreflight(project: Project, plan: StitchPlan): Issue[] {
  const issues: Issue[] = [];
  const m = project.machine;
  if (!plan.stitchCount)
    issues.push({ level: "error", message: "No stitches to export." });
  if (m) {
    if (plan.stitchCount > m.maxStitches)
      issues.push({
        level: "error",
        message: `${m.name}: stitch count exceeds the configured ${m.maxStitches.toLocaleString()} limit.`,
      });
    if (
      plan.colorChanges +
        1 +
        project.objects.filter((o) => isSewingObject(o) && o.pauseAfter)
          .length >
      m.maxColors
    )
      issues.push({
        level: "error",
        message: `${m.name}: colour stops exceed the configured ${m.maxColors} limit.`,
      });
  }
  const check = m?.fieldCheck ?? project.workspaceMode !== "freeform";
  if (check) {
    const w = m?.fieldWidth ?? project.hoopWidth,
      h = m?.fieldHeight ?? project.hoopHeight;
    const cx = project.width / 2,
      cy = project.height / 2;
    const start = startOrigin(
      project,
      plan.stitches.find((s) => s.command === "jump" || s.command === "stitch"),
    );
    if (
      [start, ...plan.stitches].some(
        (s) =>
          Math.abs(s.x - cx) > w / 2 + 0.00001 ||
          Math.abs(s.y - cy) > h / 2 + 0.00001,
      )
    )
      issues.push({
        level: "error",
        message: `Needle or frame travel exceeds the configured ${w} × ${h} mm sewing field. Resize, reposition or change the machine field.`,
      });
  } else
    issues.push({
      level: "warning",
      message:
        "Freeform export: no physical machine field is enforced. Verify the machine's travel limits and start position before loading.",
    });
  return issues;
}
