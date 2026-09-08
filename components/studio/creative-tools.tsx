"use client";
import { createId } from "@/lib/embroidery/id";
import { useMemo, useState } from "react";
import { Flower2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  SHAPE_NAMES,
  motifShape,
  repeatObjects,
  type PatternOptions,
  type ShapeName,
} from "@/lib/embroidery/design-tools";
import {
  STITCH_NAMES,
  makeObject,
  type EmbroideryObject,
  type Project,
  type StitchType,
} from "@/lib/embroidery/types";
import { VectorPreview } from "./vector-preview";
import { Choice, Range, NumberField } from "./controls";
const palettes = [
  {
    name: "Botanical",
    colors: ["#245c50", "#659179", "#b1c1a3", "#eadfbf", "#b77751"],
  },
  {
    name: "Ceramic",
    colors: ["#263d79", "#6889af", "#a8c7c7", "#ead7bb", "#f4efe1"],
  },
  {
    name: "Wildflower",
    colors: ["#733e56", "#ae777d", "#daa980", "#b1b47d", "#486552"],
  },
  {
    name: "Primary play",
    colors: ["#2454ce", "#e05b43", "#e5bd45", "#7eb6ac", "#eee7d3"],
  },
];
export function MotifBrowser({
  open,
  onOpenChange,
  project,
  color,
  onAdd,
  onPalette,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  color: string;
  onAdd: (partial: Partial<EmbroideryObject>) => void;
  onPalette: (colors: string[]) => void;
}) {
  const [shape, setShape] = useState<ShapeName>("flower"),
    [size, setSize] = useState(35),
    [method, setMethod] = useState<StitchType>("tatami");
  const preview: Project = {
    ...project,
    width: 60,
    height: 60,
    objects: [
      makeObject({
        id: "preview",
        name: "Preview",
        color,
        paths: motifShape(shape, 42, { x: 30, y: 30 }),
        type: method,
      }),
    ],
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="creative-dialog">
        <DialogHeader>
          <DialogTitle>A shape is a starting point.</DialogTitle>
          <DialogDescription>
            Original vector motifs and colour studies. Every shape remains
            editable.
          </DialogDescription>
        </DialogHeader>
        <div className="creative-layout">
          <div>
            <div className="motif-grid">
              {Object.entries(SHAPE_NAMES).map(([key, label]) => (
                <button
                  className={`motif-choice ${shape === key ? "active" : ""}`}
                  key={key}
                  onClick={() => setShape(key as ShapeName)}
                >
                  <VectorPreview
                    project={{
                      ...preview,
                      objects: [
                        makeObject({
                          id: key,
                          name: label,
                          paths: motifShape(key as ShapeName, 40, {
                            x: 30,
                            y: 30,
                          }),
                          color: "#657f79",
                        }),
                      ],
                    }}
                  />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="palette-studies">
              {palettes.map((p) => (
                <button key={p.name} onClick={() => onPalette(p.colors)}>
                  <span>{p.name}</span>
                  <span className="palette-strip">
                    {p.colors.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="motif-detail">
            <VectorPreview project={preview} />
            <NumberField
              label="Shape size"
              value={size}
              min={0.1}
              max={null}
              onChange={setSize}
            />
            <Choice
              label="Motif stitch method"
              value={method}
              onChange={(v) => setMethod(v as StitchType)}
              options={[
                "tatami",
                "satin",
                "run",
                "triple",
                "cross",
                "motif",
                "wave",
              ].map((value) => ({
                value,
                label: STITCH_NAMES[value as StitchType],
              }))}
            />
            <button
              className="button primary full"
              onClick={() => {
                onAdd({
                  name: SHAPE_NAMES[shape],
                  paths: motifShape(shape, size, {
                    x: project.width / 2,
                    y: project.height / 2,
                  }),
                  type: method,
                  underlay: !["run", "triple", "cross", "motif"].includes(
                    method,
                  ),
                });
                onOpenChange(false);
              }}
            >
              <Flower2 size={16} />
              Add to design
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function PatternLab({
  open,
  onOpenChange,
  project,
  objects,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  objects: EmbroideryObject[];
  onApply: (objects: EmbroideryObject[]) => void;
}) {
  const [options, setOptions] = useState<PatternOptions>({
    layout: "radial",
    rows: 2,
    columns: 3,
    gap: 6,
    count: 6,
    radius: 40,
    rotate: true,
    mirror: false,
  });
  const result = useMemo(() => {
    try {
      return {
        objects: repeatObjects(
          objects,
          options,
          { x: project.width / 2, y: project.height / 2 },
          "pattern-preview",
        ),
        error: "",
      };
    } catch (error) {
      return { objects: [], error: (error as Error).message };
    }
  }, [objects, options, project.width, project.height]);
  const update = (partial: Partial<PatternOptions>) =>
    setOptions({ ...options, ...partial });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="creative-dialog">
        <DialogHeader>
          <DialogTitle>Pattern lab</DialogTitle>
          <DialogDescription>
            Arrange your selection into an editable repeat. The preview responds
            to each change.
          </DialogDescription>
        </DialogHeader>
        <div className="pattern-layout">
          <div className="pattern-preview">
            <VectorPreview project={{ ...project, objects: result.objects }} />
          </div>
          <div className="pattern-controls">
            <Choice
              label="Repeat layout"
              value={options.layout}
              onChange={(v) =>
                update({ layout: v as PatternOptions["layout"] })
              }
              options={[
                { value: "radial", label: "Radial repeat" },
                { value: "grid", label: "Grid repeat" },
              ]}
            />
            {options.layout === "radial" ? (
              <>
                <Range
                  label="Repeats"
                  value={options.count}
                  min={2}
                  max={24}
                  onChange={(count) => update({ count })}
                />
                <NumberField
                  label="Radius"
                  value={options.radius}
                  min={0}
                  max={null}
                  onChange={(radius) => update({ radius })}
                />
                <label className="toggle-row">
                  Rotate with the circle
                  <Switch
                    checked={options.rotate}
                    onCheckedChange={(rotate) => update({ rotate })}
                  />
                </label>
              </>
            ) : (
              <>
                <Range
                  label="Rows"
                  value={options.rows}
                  min={1}
                  max={12}
                  onChange={(rows) => update({ rows })}
                />
                <Range
                  label="Columns"
                  value={options.columns}
                  min={1}
                  max={12}
                  onChange={(columns) => update({ columns })}
                />
                <NumberField
                  label="Gap"
                  value={options.gap}
                  min={0}
                  max={null}
                  onChange={(gap) => update({ gap })}
                />
              </>
            )}
            <label className="toggle-row">
              Mirror alternate repeats
              <Switch
                checked={options.mirror}
                onCheckedChange={(mirror) => update({ mirror })}
              />
            </label>
            <p className="help-text">
              Each repeat is a group of editable objects. The pattern replaces
              the selected objects when applied; Undo restores the selection.
            </p>
            {result.error && <p className="issue error">{result.error}</p>}
            <button
              className="button primary full"
              disabled={!result.objects.length || !!result.error}
              onClick={() => {
                onApply(
                  repeatObjects(
                    objects,
                    options,
                    { x: project.width / 2, y: project.height / 2 },
                    createId(),
                  ),
                );
                onOpenChange(false);
              }}
            >
              <Sparkles size={16} />
              Apply pattern
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
