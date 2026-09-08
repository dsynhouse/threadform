"use client";
import { useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { Project, StitchPlan, Stitch } from "@/lib/embroidery/types";
import { startOrigin } from "@/lib/embroidery/machine-settings";
import { distance } from "@/lib/embroidery/geometry";
import { analyzeContinuity } from "@/lib/embroidery/continuity";
import { NumberField, IconButton } from "./controls";
import { useMeasurements } from "./measurement-units";
export default function StitchInspector({
  project,
  plan,
  progress,
  onSeek,
  onSelect,
}: {
  project: Project;
  plan: StitchPlan | null;
  progress: number;
  onSeek: (v: number) => void;
  onSelect?: (id: string) => void;
}) {
  const counts = useMemo(() => {
    // Counts use machine commands; changing display units does not rescale them.
    const a = new Uint32Array((plan?.stitches.length ?? 0) + 1);
    plan?.stitches.forEach(
      (s, i) => (a[i + 1] = a[i] + Number(s.command === "stitch")),
    );
    return a;
  }, [plan]);
  const continuity = useMemo(
    () => (plan ? analyzeContinuity(plan) : null),
    [plan],
  );
  const measure = useMeasurements();
  if (!plan)
    return (
      <div className="stitch-inspector">
        <p className="help-text">Rebuilding the stitch plan…</p>
      </div>
    );
  const commands = plan.stitches,
    limit = Math.round((commands.length * progress) / 100),
    index = limit - 1,
    needle = commands[index],
    origin = startOrigin(
      project,
      commands.find((s) => s.command === "jump" || s.command === "stitch"),
    ),
    previous = commands[index - 1] ?? origin;
  const structure = needle ? continuity?.get(needle.objectId) : undefined;
  const seek = (n: number) =>
    onSeek(
      commands.length
        ? (Math.max(0, Math.min(commands.length, n)) / commands.length) * 100
        : 0,
    );
  const find = (command: Stitch["command"], direction: number) => {
    for (
      let i = index + direction;
      i >= 0 && i < commands.length;
      i += direction
    )
      if (commands[i].command === command) {
        seek(i + 1);
        return;
      }
  };
  const from = Math.max(0, Math.min(commands.length - 7, index - 3));
  return (
    <div className="stitch-inspector">
      <div className="row between">
        <div>
          <strong>Stitch progression inspector</strong>
          <p className="help-text">
            {counts[limit]?.toLocaleString()} needle penetrations ·{" "}
            {limit.toLocaleString()} / {commands.length.toLocaleString()}{" "}
            commands
          </p>
        </div>
        <div className="row">
          <IconButton label="Before first stitch" onClick={() => seek(0)}>
            <ChevronsLeft />
          </IconButton>
          <IconButton
            label="Previous command"
            onClick={() => seek(limit - 1)}
            disabled={!limit}
          >
            <ChevronLeft />
          </IconButton>
          <IconButton
            label="Next command"
            onClick={() => seek(limit + 1)}
            disabled={limit >= commands.length}
          >
            <ChevronRight />
          </IconButton>
          <IconButton
            label="Last command"
            onClick={() => seek(commands.length)}
          >
            <ChevronsRight />
          </IconButton>
        </div>
      </div>
      <div className="progression-layout">
        <div>
          <NumberField
            label="Go to command"
            value={limit}
            min={0}
            max={Math.max(1, commands.length)}
            unit=""
            onChange={seek}
          />
          <div className="needle-detail">
            {needle ? (
              <>
                <span className="badge">
                  {needle.command.toUpperCase()}
                  {needle.underlay ? " · UNDERLAY" : ""}
                </span>
                <strong>
                  {project.objects.find((o) => o.id === needle.objectId)?.name}
                </strong>
                {onSelect && (
                  <button
                    className="button"
                    onClick={() => onSelect(needle.objectId)}
                  >
                    Select &amp; fit source object
                  </button>
                )}
                {structure && (
                  <span>
                    1 editable object · {structure.sections} sewing{" "}
                    {structure.sections === 1 ? "section" : "sections"} ·{" "}
                    {structure.trims} {structure.trims === 1 ? "trim" : "trims"}
                  </span>
                )}
                <span>
                  X {measure.number(needle.x)} · Y {measure.length(needle.y)}
                </span>
                <span>
                  ΔX {measure.number(needle.x - previous.x)} · ΔY{" "}
                  {measure.length(needle.y - previous.y)}
                </span>
                <span>
                  Length {measure.length(distance(previous, needle))} ·{" "}
                  {needle.color.toUpperCase()}
                </span>
              </>
            ) : (
              <span>
                At start position: {measure.number(origin.x)},{" "}
                {measure.length(origin.y)}
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="command-jumps">
            {(["stitch", "jump", "trim", "color"] as const).map((command) => (
              <div key={command}>
                <button
                  className="button"
                  aria-label={`Previous ${command}`}
                  onClick={() => find(command, -1)}
                >
                  ‹
                </button>
                <span>{command}</span>
                <button
                  className="button"
                  aria-label={`Next ${command}`}
                  onClick={() => find(command, 1)}
                >
                  ›
                </button>
              </div>
            ))}
          </div>
          <div
            className="command-table"
            role="table"
            aria-label="Nearby stitch commands"
          >
            <div className="command-row header" role="row">
              <span>#</span>
              <span>Command</span>
              <span>X {measure.unit}</span>
              <span>Y {measure.unit}</span>
            </div>
            {commands.slice(from, from + 7).map((s, i) => (
              <button
                role="row"
                key={from + i}
                className={`command-row ${from + i === index ? "active" : ""}`}
                onClick={() => seek(from + i + 1)}
              >
                <span>{(from + i + 1).toLocaleString()}</span>
                <span>
                  <i style={{ background: s.color }} />
                  {s.command}
                  {s.underlay ? " · UL" : ""}
                </span>
                <span>{measure.number(s.x)}</span>
                <span>{measure.number(s.y)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
