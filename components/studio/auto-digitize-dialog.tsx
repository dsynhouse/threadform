"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useGeometryTask } from "@/hooks/use-geometry-task";
import { useStitchPlan } from "@/hooks/use-stitch-plan";
import {
  DEFAULT_AUTO,
  type AutoOptions,
  type AutoResult,
} from "@/lib/embroidery/auto-digitize";
import {
  STITCH_NAMES,
  type Project,
  type StitchType,
} from "@/lib/embroidery/types";
import { NumberField, errorMessage } from "./controls";
import { PlanPreview } from "./plan-preview";

export default function AutoDigitizeDialog({
  project,
  selected,
  open,
  onOpenChange,
  onApply,
}: {
  project: Project;
  selected: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (p: Project) => void;
}) {
  const [options, setOptions] = useState<AutoOptions>(DEFAULT_AUTO),
    [scope, setScope] = useState(false);
  const [draft, setDraft] = useState<{
    base: Project;
    key: string;
    result: AutoResult;
  } | null>(null);
  const task = useGeometryTask<AutoResult>();
  const jobOptions = { ...options, ids: scope ? selected : [] },
    key = JSON.stringify(jobOptions);
  const fresh = !!draft && draft.base === project && draft.key === key;
  const stitches = useStitchPlan(draft?.result.project ?? project);
  const change = (patch: Partial<AutoOptions>) =>
    setOptions((o) => ({ ...o, ...patch }));
  async function preview() {
    const base = project,
      requestKey = key;
    try {
      const result = await task.run({
        kind: "auto",
        project,
        options: jobOptions,
      });
      setDraft({ base, key: requestKey, result });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="auto-digitize-dialog">
        <DialogHeader>
          <DialogTitle>Auto-digitize with detail control</DialogTitle>
          <DialogDescription>
            Review proposed stitch methods at your design’s physical size. Exact
            colours and locked objects stay protected.
          </DialogDescription>
        </DialogHeader>
        <div className="auto-layout">
          <div className="auto-settings">
            <label className="toggle-row">
              Selected objects only
              <Switch
                disabled={!selected.length || task.busy}
                checked={scope}
                onCheckedChange={setScope}
              />
            </label>
            <NumberField
              label="Maximum satin span"
              value={options.satinWidth}
              min={1}
              max={7}
              onChange={(satinWidth) => change({ satinWidth })}
              disabled={task.busy}
            />
            <NumberField
              label="Flag details below"
              value={options.detailWidth}
              min={0.3}
              max={1.5}
              onChange={(detailWidth) => change({ detailWidth })}
              disabled={task.busy}
            />
            <label className="toggle-row">
              Retain runs and specialty methods
              <Switch
                checked={options.preserveMethods}
                onCheckedChange={(preserveMethods) =>
                  change({ preserveMethods })
                }
                disabled={task.busy}
              />
            </label>
            <label className="toggle-row">
              Digitize artwork-only objects
              <Switch
                checked={options.includeArtwork}
                onCheckedChange={(includeArtwork) => change({ includeArtwork })}
                disabled={task.busy}
              />
            </label>
            <label className="toggle-row">
              Separate disconnected regions
              <Switch
                checked={options.separate}
                onCheckedChange={(separate) => change({ separate })}
                disabled={task.busy}
              />
            </label>
            <p className="help-text">
              Narrow regions become paired satin rails when their outline passes
              an area comparison. Branched regions and holes retain tatami
              coverage. Fabric settings follow the project.
            </p>
            <button
              className="button primary full"
              disabled={
                task.busy ||
                !project.objects.length ||
                (scope && !selected.length)
              }
              onClick={() => void preview()}
            >
              {task.busy ? "Analysing geometry…" : "Preview digitizing"}
            </button>
            <button
              className="button full"
              disabled={
                !fresh || task.busy || stitches.busy || !!stitches.error
              }
              onClick={() => {
                if (fresh && draft) {
                  onApply(draft.result.project);
                  onOpenChange(false);
                  toast.success(
                    `${draft.result.changed} regions digitized. Undo restores the original.`,
                  );
                }
              }}
            >
              Apply reviewed draft
            </button>
          </div>
          <div className="auto-results">
            <PlanPreview
              project={draft?.result.project ?? project}
              plan={stitches.plan}
              view="stitches"
              label="Auto-digitizing stitch preview"
            />
            <p className="help-text" role="status">
              {task.busy
                ? "Checking region widths and outlines…"
                : (stitches.error ??
                  (stitches.busy
                    ? "Generating stitches…"
                    : `${stitches.plan?.stitchCount.toLocaleString() ?? 0} needle stitches`))}
              {draft && !fresh
                ? " · Settings changed: preview again before applying."
                : ""}
            </p>
            <div className="decision-list">
              {draft?.result.decisions.map((d) => (
                <div
                  key={d.id}
                  className={`decision-row ${d.review ? "review" : ""}`}
                >
                  <strong>
                    {d.name} <span>{STITCH_NAMES[d.method as StitchType]}</span>
                  </strong>
                  <p>{d.reason}</p>
                </div>
              )) ?? <p>Preview to see a decision for every region.</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
