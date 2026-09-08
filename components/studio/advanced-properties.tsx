"use client";
import { CROSS_TYPES } from "@/lib/embroidery/specialty";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  EFFECT_RUNS,
  EFFECT_FILLS,
  SPLIT_PATTERNS,
  motifTile,
} from "@/lib/embroidery/effects";
import type { EmbroideryObject, Point, Project } from "@/lib/embroidery/types";
import { Choice, Range, NumberField } from "./controls";
import { Switch } from "@/components/ui/switch";
export function AdvancedProperties({
  object,
  update,
  disabled,
}: {
  object: EmbroideryObject;
  update: (p: Partial<EmbroideryObject>) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [paths, setPaths] = useState<Point[][]>([]),
    [pathIndex, setPathIndex] = useState(0);
  const patterned = [...EFFECT_RUNS, ...EFFECT_FILLS, "program-split"].includes(
    object.type,
  );
  return (
    <>
      {object.type === "raised-satin" && (
        <Range
          label="Satin layers"
          value={object.satinLayers ?? 3}
          min={2}
          max={5}
          disabled={disabled}
          onChange={(satinLayers) => update({ satinLayers })}
        />
      )}
      {CROSS_TYPES.includes(object.type) && (
        <>
          <NumberField
            label="Cross grid size"
            value={object.crossSize ?? object.patternSize ?? 2}
            min={0.5}
            max={10}
            disabled={disabled}
            onChange={(crossSize) => update({ crossSize })}
          />
          <Choice
            label="Cross-stitch order"
            value={object.crossOrder ?? "english"}
            disabled={disabled}
            onChange={(crossOrder) =>
              update({ crossOrder: crossOrder as "english" | "danish" })
            }
            options={[
              { value: "english", label: "English · complete each cross" },
              { value: "danish", label: "Danish · bottom legs, then top" },
            ]}
          />
          <Choice
            label="Top diagonal"
            value={object.crossTop ?? "slash"}
            disabled={disabled}
            onChange={(crossTop) =>
              update({ crossTop: crossTop as "slash" | "backslash" })
            }
            options={[
              { value: "slash", label: "Top leg /" },
              { value: "backslash", label: "Top leg descending" },
            ]}
          />
          <Range
            label="Cross repeats"
            value={object.crossRepeats ?? 1}
            min={1}
            max={3}
            disabled={disabled}
            onChange={(crossRepeats) => update({ crossRepeats })}
          />
        </>
      )}
      {patterned && (
        <NumberField
          label="Pattern repeat"
          value={object.patternSize ?? 4}
          min={1.5}
          max={null}
          unit=" mm"
          disabled={disabled}
          onChange={(patternSize) => update({ patternSize })}
        />
      )}
      {[...EFFECT_RUNS, "column-c"].includes(object.type) && (
        <NumberField
          label={object.type === "column-c" ? "Column C width" : "Effect width"}
          value={object.lineWidth ?? 3}
          min={0.5}
          max={null}
          unit=" mm"
          disabled={disabled}
          onChange={(lineWidth) => update({ lineWidth })}
        />
      )}
      {object.type === "program-split" && (
        <div className="field">
          <span className="small-label">Program split tile</span>
          <Choice
            label="Program split tile"
            value={object.splitPattern ?? "diamond"}
            disabled={disabled}
            onChange={(v) =>
              update({ splitPattern: v as EmbroideryObject["splitPattern"] })
            }
            options={SPLIT_PATTERNS.map((value) => ({
              value,
              label: value[0].toUpperCase() + value.slice(1),
            }))}
          />
        </div>
      )}
      {["tatami", "satin", "program-split"].includes(object.type) && (
        <>
          <div className="field">
            <span className="small-label">Edge finish</span>
            <Choice
              label="Edge finish"
              value={object.edgeEffect ?? "none"}
              disabled={disabled}
              onChange={(v) =>
                update({ edgeEffect: v as EmbroideryObject["edgeEffect"] })
              }
              options={[
                { value: "none", label: "Clean edge" },
                { value: "feather", label: "Feathered edge" },
                { value: "jagged", label: "Jagged edge" },
              ]}
            />
          </div>
          {object.edgeEffect && object.edgeEffect !== "none" && (
            <Range
              label="Edge variation inward"
              value={object.effectDepth ?? 0.6}
              min={0}
              max={3}
              step={0.05}
              unit=" mm"
              disabled={disabled}
              onChange={(effectDepth) => update({ effectDepth })}
            />
          )}
        </>
      )}
      {object.type === "candlewick" && (
        <Range
          label="Knot effect repeats"
          value={object.repeatCount ?? 2}
          min={1}
          max={5}
          disabled={disabled}
          onChange={(repeatCount) => update({ repeatCount })}
        />
      )}
      {["motif", "motif-run", "program-split"].includes(object.type) && (
        <>
          <button
            className="button full"
            disabled={disabled}
            onClick={() => {
              setPaths(structuredClone(motifTile(object)));
              setPathIndex(0);
              setOpen(true);
            }}
          >
            Draw a custom pattern tile
          </button>
          {object.customPattern && (
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => update({ customPattern: undefined })}
            >
              Reset to built-in motif
            </button>
          )}
        </>
      )}
      <div className="field">
        <span className="small-label">Connect separate regions / motifs</span>
        <Choice
          label="Path connectors"
          value={object.connector ?? "auto"}
          disabled={disabled}
          onChange={(v) =>
            update({ connector: v as EmbroideryObject["connector"] })
          }
          options={[
            { value: "auto", label: "Auto · contained travel / jump" },
            { value: "jump", label: "Jump between paths" },
            { value: "trim", label: "Trim between paths" },
          ]}
        />
      </div>
      <p className="help-text">
        Rows inside a filled region stay connected. These controls apply to
        separate regions or motifs; running connectors can be visible in open
        patterns. The progression inspector shows each object’s sewing sections.
      </p>
      {["chain", "candlewick", "coil-run", "coil-fill"].includes(
        object.type,
      ) && (
        <p className="help-text">
          Decorative lockstitch paths. Actual chenille chain/moss, coiling,
          cording and sequin hardware commands require a dedicated
          machine-specific system.
        </p>
      )}
      {object.type === "column-c" && (
        <p className="help-text">
          Width follows the centreline. Inspect tight turns where the width
          exceeds the bend radius.
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Draw your stitch motif</DialogTitle>
            <DialogDescription>
              Click to add points on the tile. The tile repeats at the physical
              size set in Properties. Right-click a node to remove it.
            </DialogDescription>
          </DialogHeader>
          <svg
            viewBox="-0.05 -0.05 1.1 1.1"
            className="pattern-tile-editor"
            role="img"
            aria-label="Custom motif drawing area"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const r = e.currentTarget.getBoundingClientRect(),
                x =
                  Math.round(
                    Math.max(
                      0,
                      Math.min(
                        1,
                        ((e.clientX - r.left) / r.width) * 1.1 - 0.05,
                      ),
                    ) * 20,
                  ) / 20,
                y =
                  Math.round(
                    Math.max(
                      0,
                      Math.min(
                        1,
                        ((e.clientY - r.top) / r.height) * 1.1 - 0.05,
                      ),
                    ) * 20,
                  ) / 20;
              setPaths((p) => {
                const next = p.map((a) => [...a]);
                if (!next[pathIndex]) next[pathIndex] = [];
                if (next.reduce((s, a) => s + a.length, 0) < 500)
                  next[pathIndex].push({ x, y });
                return next;
              });
            }}
          >
            <rect
              x="0"
              y="0"
              width="1"
              height="1"
              fill="#f5f7fc"
              stroke="#bac9e6"
              strokeWidth=".003"
            />
            {Array.from({ length: 19 }, (_, i) => (
              <path
                key={i}
                d={`M ${(i + 1) / 20} 0 V 1 M 0 ${(i + 1) / 20} H 1`}
                stroke="#dfe5f0"
                strokeWidth=".0015"
              />
            ))}
            {paths.map((p, i) => (
              <g key={i}>
                <polyline
                  points={p.map((v) => `${v.x},${v.y}`).join(" ")}
                  fill="none"
                  stroke={i === pathIndex ? "#2459e7" : "#2f8275"}
                  strokeWidth=".009"
                />
                {p.map((v, j) => (
                  <circle
                    key={j}
                    cx={v.x}
                    cy={v.y}
                    r=".012"
                    fill="#2459e7"
                    onPointerDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setPaths((p) =>
                        p.map((a, k) =>
                          k === i ? a.filter((_, n) => n !== j) : a,
                        ),
                      );
                    }}
                  />
                ))}
              </g>
            ))}
          </svg>
          <div className="row">
            <button
              className="button"
              onClick={() => {
                setPaths([[]]);
                setPathIndex(0);
              }}
            >
              Clear
            </button>
            <button
              className="button"
              onClick={() =>
                setPaths((p) =>
                  p.map((a, i) => (i === pathIndex ? a.slice(0, -1) : a)),
                )
              }
            >
              Undo point
            </button>
            <button
              className="button"
              disabled={paths.length >= 16}
              onClick={() => {
                setPathIndex(paths.length);
                setPaths((p) => [...p, []]);
              }}
            >
              New path
            </button>
          </div>
          <button
            className="button primary full"
            disabled={!paths.some((p) => p.length > 1)}
            onClick={() => {
              update({
                customPattern: paths.filter((p) => p.length > 1),
                ...(object.type === "program-split"
                  ? { splitPattern: "custom" as const }
                  : {}),
              });
              setOpen(false);
            }}
          >
            Apply pattern tile
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function WorkspaceControls({
  project,
  onProject,
}: {
  project: Project;
  onProject: (p: Project) => void;
}) {
  return (
    <>
      <div className="field">
        <span className="small-label">Design workspace</span>
        <Choice
          label="Workspace boundary"
          value={project.workspaceMode ?? "hoop"}
          onChange={(v) =>
            onProject({
              ...project,
              workspaceMode: v as Project["workspaceMode"],
            })
          }
          options={[
            { value: "freeform", label: "Freeform · unrestricted by hoop" },
            { value: "hoop", label: "Hoop · check sewing boundary" },
          ]}
        />
      </div>
      <p className="help-text">
        Freeform keeps the artboard as a design reference. Artwork and stitching
        can extend beyond it. Machine field checks are configured separately at
        export.
      </p>
      <h3>Auto start & end</h3>
      <div className="field">
        <span className="small-label">Start position / machine origin</span>
        <Choice
          label="Auto start"
          value={project.autoStart ?? "center"}
          onChange={(v) =>
            onProject({
              ...project,
              autoStart: v as Project["autoStart"],
              startPoint: project.startPoint ?? {
                x: project.width / 2,
                y: project.height / 2,
              },
            })
          }
          options={[
            { value: "center", label: "Artboard centre" },
            { value: "first", label: "First needle position" },
            { value: "custom", label: "Custom position" },
          ]}
        />
      </div>
      {project.autoStart === "custom" && (
        <div className="two-fields">
          {(["x", "y"] as const).map((axis) => (
            <NumberField
              key={axis}
              label={`Start ${axis.toUpperCase()}`}
              value={project.startPoint?.[axis] ?? 0}
              min={null}
              max={null}
              onChange={(v) =>
                onProject({
                  ...project,
                  startPoint: {
                    ...(project.startPoint ?? { x: 0, y: 0 }),
                    [axis]: v,
                  },
                })
              }
            />
          ))}
        </div>
      )}
      <div className="field">
        <span className="small-label">End position</span>
        <Choice
          label="Auto end"
          value={project.autoEnd ?? "last"}
          onChange={(v) =>
            onProject({
              ...project,
              autoEnd: v as Project["autoEnd"],
              endPoint: project.endPoint ?? {
                x: project.width / 2,
                y: project.height / 2,
              },
            })
          }
          options={[
            { value: "last", label: "Last stitch" },
            { value: "start", label: "Return to start" },
            { value: "custom", label: "Custom position" },
          ]}
        />
      </div>
      {project.autoEnd === "custom" && (
        <div className="two-fields">
          {(["x", "y"] as const).map((axis) => (
            <NumberField
              key={axis}
              label={`End ${axis.toUpperCase()}`}
              value={project.endPoint?.[axis] ?? 0}
              min={null}
              max={null}
              onChange={(v) =>
                onProject({
                  ...project,
                  endPoint: {
                    ...(project.endPoint ?? { x: 0, y: 0 }),
                    [axis]: v,
                  },
                })
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
export function MachineControls({
  project,
  onProject,
}: {
  project: Project;
  onProject: (p: Project) => void;
}) {
  const m = project.machine ?? {
    name: "Custom machine",
    fieldWidth: project.hoopWidth,
    fieldHeight: project.hoopHeight,
    fieldCheck: project.workspaceMode !== "freeform",
    maxStitches: 350000,
    maxColors: 999,
  };
  const update = (p: Partial<typeof m>) =>
    onProject({ ...project, machine: { ...m, ...p } });
  return (
    <details className="machine-controls">
      <summary>Machine field & file limits</summary>
      <p className="help-text">
        Enter the limits from your exact machine model&apos;s manual. Colour
        segments include the first colour and each subsequent change; this is
        separate from installed needle count.
      </p>
      <label className="small-label">
        Machine model
        <input
          className="text-input"
          value={m.name}
          maxLength={100}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label className="toggle-row">
        Enforce physical sewing field
        <Switch
          checked={m.fieldCheck}
          onCheckedChange={(fieldCheck) => update({ fieldCheck })}
        />
      </label>
      <div className="two-fields">
        <NumberField
          label="Field width"
          max={null}
          value={m.fieldWidth}
          onChange={(fieldWidth) => update({ fieldWidth })}
        />
        <NumberField
          label="Field height"
          max={null}
          value={m.fieldHeight}
          onChange={(fieldHeight) => update({ fieldHeight })}
        />
        <NumberField
          label="Maximum stitches"
          value={m.maxStitches}
          min={1}
          max={10000000}
          unit=""
          onChange={(maxStitches) => update({ maxStitches })}
        />
        <NumberField
          label="Maximum colour segments"
          value={m.maxColors}
          min={1}
          max={10000}
          unit=""
          onChange={(maxColors) => update({ maxColors })}
        />
      </div>
      <p className="help-text">
        DST: 0.1 mm coordinates, 12.1 mm maximum movement per record, no
        embedded RGB. Three-jump trims depend on controller settings. This
        release is not qualified for a specific machine model.
      </p>
    </details>
  );
}
