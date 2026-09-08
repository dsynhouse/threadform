import type { Project, StitchPlan } from "./types";
import { machinePreflight, startOrigin } from "./machine-settings";
export type MachineFormat = "dst" | "pes" | "jef" | "exp";
export type MachineRecord = {
  x: number;
  y: number;
  command: "stitch" | "jump" | "trim" | "color" | "stop" | "sequin";
  color: string;
};
/** One normalized, absolute 0.1 mm stream. Coordinates retain the editor's Y-down convention. */
export function machineStream(
  project: Project,
  plan: StitchPlan,
  format: MachineFormat,
): MachineRecord[] {
  const errors = [...plan.issues, ...machinePreflight(project, plan)].filter(
    (i) => i.level === "error",
  );
  if (errors.length) throw new Error(errors[0].message);
  const origin = startOrigin(
    project,
    plan.stitches.find((s) => s.command === "stitch" || s.command === "jump"),
  );
  const objects = new Map(project.objects.map((o) => [o.id, o]));
  const records: MachineRecord[] = [];
  for (let i = 0; i < plan.stitches.length; i++) {
    const s = plan.stitches[i],
      o = objects.get(s.objectId);
    if (
      o?.sequinMode &&
      (format !== "dst" ||
        project.machine?.specialty !== "tajima-single-sequin")
    )
      throw new Error(
        "Sequin drops require DST and the Tajima single-sequin profile. Unsupported hardware commands are never converted to normal stitches.",
      );
    if (
      o?.sequinMode &&
      (o.type !== "manual" ||
        o.underlay ||
        o.tieIn !== false ||
        o.tieOut !== false)
    )
      throw new Error(
        "Sequin objects must use manual needle points with underlay and tie stitches switched off. Each point is one drop.",
      );
    const record: MachineRecord = {
      x: Math.round((s.x - origin.x) * 10) || 0,
      y: Math.round((s.y - origin.y) * 10) || 0,
      command: o?.sequinMode && s.command === "stitch" ? "sequin" : s.command,
      color: s.color,
    };
    if (!Number.isSafeInteger(record.x) || !Number.isSafeInteger(record.y))
      throw new Error("Invalid machine coordinate.");
    const previous = records.at(-1);
    // All writers share this quantization policy. Preserve every sequin drop,
    // including stationary drops, but suppress collapsed ordinary movements.
    if (
      record.command !== "stitch" ||
      record.x !== (previous?.x ?? 0) ||
      record.y !== (previous?.y ?? 0)
    )
      records.push(record);
    if (o?.pauseAfter && plan.stitches[i + 1]?.objectId !== s.objectId)
      records.push({ ...record, command: "stop" });
  }
  return records;
}
/** Split relative moves after absolute rounding; never wrap signed bytes. */
export function splitMachineMoves(
  records: MachineRecord[],
  limit: number,
): MachineRecord[] {
  const out: MachineRecord[] = [];
  let x = 0,
    y = 0;
  for (const r of records) {
    if (!["stitch", "jump", "sequin"].includes(r.command)) {
      out.push({ ...r, x, y });
      continue;
    }
    const n = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(r.x - x), Math.abs(r.y - y)) / limit),
      ),
      ox = x,
      oy = y;
    if (r.command === "sequin" && n > 1)
      throw new Error(
        "Sequin spacing exceeds 12.1 mm. Add an explicit travel point before the next drop.",
      );
    for (let i = 1; i <= n; i++)
      out.push({
        ...r,
        x: Math.round(ox + ((r.x - ox) * i) / n),
        y: Math.round(oy + ((r.y - oy) * i) / n),
      });
    x = r.x;
    y = r.y;
  }
  return out;
}
