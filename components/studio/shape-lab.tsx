"use client";
import { createId } from "@/lib/embroidery/id";
import { useState } from "react";
import { Check, Download, Loader2, Scissors, Shapes } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGeometryTask } from "@/hooks/use-geometry-task";
import {
  exportCutSVG,
  type ShapeAction,
  type ShapeResult,
} from "@/lib/embroidery/shape-edit";
import type { Project } from "@/lib/embroidery/types";
import {
  Choice,
  download,
  errorMessage,
  fileName,
  NumberField,
} from "./controls";
import { VectorPreview } from "./vector-preview";

const descriptions: Record<string, string> = {
  blend:
    "Build two editable tatami layers with complementary density gradients and a constant combined density budget.",
  union:
    "Weld the selected closed shapes. The first shape supplies the colour and stitch settings.",
  difference:
    "Subtract every later selected shape from the first selected shape in sewing order.",
  intersection: "Keep only the area shared by every selected shape.",
  xor: "Keep areas covered an odd number of times, producing cutouts where shapes overlap.",
  offset: "Expand or inset shapes with round corners, preserving their holes.",
  border:
    "Add an editable satin border around each selected shape. Positive offsets expand outward.",
  "remove-overlaps":
    "Cut hidden stitching beneath later selected solid fills. Retain an edge allowance to reduce gaps.",
  simplify:
    "Reduce vector points within a physical tolerance. Compare details and hole boundaries before applying.",
  applique:
    "Replace filled shapes with grouped placement, tack-down and zigzag cover passes. Pause your machine manually to place fabric after the placement pass.",
};
export default function ShapeLab({
  open,
  onOpenChange,
  project,
  selected,
  onApply,
  initialAction = "union",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  selected: string[];
  onApply: (project: Project) => void;
  initialAction?: ShapeAction;
}) {
  const [action, setAction] = useState<ShapeAction>(initialAction),
    [amount, setAmount] = useState(initialAction === "applique" ? 2 : 0.3),
    [color, setColor] = useState("#17283a");
  const [draft, setDraft] = useState<{
    base: Project;
    key: string;
    result: ShapeResult;
  } | null>(null);
  const task = useGeometryTask<ShapeResult>();
  const key = JSON.stringify({ action, amount, selected, color });
  const fresh = !!draft && draft.base === project && draft.key === key;
  const chosen = project.objects.filter(
    (o) => selected.includes(o.id) && !o.locked && o.visible,
  );
  const points = (p: Project) =>
    p.objects.reduce(
      (n, o) => n + o.paths.reduce((sum, path) => sum + path.length, 0),
      0,
    );
  const min =
    action === "offset" || action === "border"
      ? null
      : action === "applique"
        ? 0.5
        : 0;
  const max =
    action === "simplify"
      ? 1
      : action === "remove-overlaps"
        ? 1
        : action === "applique"
          ? 6
          : null;
  async function preview() {
    try {
      const result = await task.run({
        kind: "shape",
        project,
        options: {
          action,
          ids: selected,
          amount,
          color,
          seed: createId(),
        },
      });
      setDraft({ base: project, key, result });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="shape-lab-dialog">
        <DialogHeader>
          <DialogTitle>Shape & cutting workshop</DialogTitle>
          <DialogDescription>
            Refine the actual vector geometry and regenerate stitches from your
            edits.
          </DialogDescription>
        </DialogHeader>
        <div className="shape-lab-layout">
          <div className="shape-lab-controls">
            <h3>
              <Shapes size={17} />
              {chosen.length} editable objects
            </h3>
            <Choice
              label="Shape operation"
              value={action}
              onChange={(value) => {
                const next = value as ShapeAction;
                setAction(next);
                setAmount(
                  next === "applique" ? 2 : next === "simplify" ? 0.1 : 0.3,
                );
              }}
              options={Object.keys(descriptions).map((value) => ({
                value,
                label: (
                  {
                    blend: "Two-colour shading",
                    union: "Weld / union",
                    difference: "Subtract top shapes",
                    intersection: "Intersect shapes",
                    xor: "Exclude overlaps",
                    offset: "Offset contour",
                    border: "Add satin border",
                    "remove-overlaps": "Remove hidden overlaps",
                    simplify: "Simplify vector nodes",
                    applique: "Build appliqué passes",
                  } as Record<string, string>
                )[value],
              }))}
            />
            <p className="help-text">{descriptions[action]}</p>
            {[
              "offset",
              "border",
              "remove-overlaps",
              "simplify",
              "applique",
            ].includes(action) && (
              <NumberField
                label={
                  action === "simplify"
                    ? "Maximum deviation"
                    : action === "applique"
                      ? "Cover width"
                      : action === "remove-overlaps"
                        ? "Retained overlap"
                        : "Offset distance"
                }
                value={amount}
                min={min}
                max={max}
                unit=" mm"
                onChange={setAmount}
              />
            )}
            {["border", "applique", "blend"].includes(action) && (
              <label className="toggle-row">
                New thread colour
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="New border thread colour"
                />
              </label>
            )}
            <button
              className="button soft full"
              disabled={task.busy || !chosen.length}
              onClick={() => void preview()}
            >
              {task.busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Scissors size={16} />
              )}
              Preview geometry
            </button>
            <button
              className="button primary full"
              disabled={!fresh || task.busy || !draft?.result.changed}
              onClick={() => {
                if (draft) {
                  onApply(draft.result.project);
                  onOpenChange(false);
                  toast.success(
                    "Shape edit applied. Undo restores the original geometry.",
                  );
                }
              }}
            >
              <Check size={16} />
              Apply shape edit
            </button>
            <div className="control-divider" />
            <h3>Cutting outline · SVG</h3>
            <p className="help-text">
              Export the current selection at 1:1 scale. Holes are retained; the
              file contains vector cut lines, with no laser settings.
            </p>
            <button
              className="button full"
              disabled={!chosen.length}
              onClick={() => {
                try {
                  download(
                    exportCutSVG(project, selected, 0),
                    fileName(project.name) + "-cut-lines.svg",
                    "image/svg+xml",
                  );
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              <Download size={16} />
              Download cut lines
            </button>
          </div>
          <div className="shape-lab-preview">
            <div className="shape-comparison">
              <div>
                <span>Original</span>
                <VectorPreview project={project} selected={selected} />
              </div>
              <div>
                <span>
                  {draft
                    ? fresh
                      ? "Proposed geometry"
                      : "Previous preview"
                    : "Preview your edit"}
                </span>
                {draft ? (
                  <VectorPreview project={draft.result.project} />
                ) : (
                  <div className="shape-preview-empty">
                    <Scissors size={30} />
                    <p>Choose a shape operation to see its result.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="shape-result-strip">
              <span>{points(project).toLocaleString()} vector points</span>
              {draft && (
                <>
                  <span>
                    → {points(draft.result.project).toLocaleString()} points
                  </span>
                  <strong>{draft.result.changed} objects edited</strong>
                </>
              )}
            </div>
            {draft?.result.notes.map((note) => (
              <p className="operation-note" key={note}>
                {note}
              </p>
            ))}
            <p className="help-text">
              All edits are reversible with Undo. Boolean cuts on turning satin
              create parallel satin fragments; redraw rails where you need a
              turning column.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
