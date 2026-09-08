"use client";
import { createId } from "@/lib/embroidery/id";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  GitBranch,
  Loader2,
  LockKeyhole,
  Palette,
  Route,
  Scissors,
  Sparkles,
  UnlockKeyhole,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGeometryTask } from "@/hooks/use-geometry-task";
import { useStitchPlan } from "@/hooks/use-stitch-plan";
import {
  DEFAULT_OPTIMIZE,
  mapColors,
  planMetrics,
  type OptimizeOptions,
  type SequenceResult,
} from "@/lib/embroidery/optimization";
import type { Project, StitchPlan } from "@/lib/embroidery/types";
import type { CanvasView } from "../embroidery-canvas";
import { PlanPreview } from "./plan-preview";
import { errorMessage, IconButton, Range, Choice } from "./controls";

type Result = SequenceResult & { notes: string[]; overlaps: number };
import { useMeasurements } from "./measurement-units";
export default function Optimizer({
  project,
  plan,
  onApply,
}: {
  project: Project;
  plan: StitchPlan | null;
  onApply: (project: Project) => void;
}) {
  const measure = useMeasurements();
  const [options, setOptions] = useState<OptimizeOptions>(DEFAULT_OPTIMIZE);
  const [draft, setDraft] = useState<{
    base: Project;
    key: string;
    result: Result;
  } | null>(null);
  const [view, setView] = useState<CanvasView>("stitches");
  const task = useGeometryTask<Result>();
  const candidate = draft?.result.project ?? project;
  const after = useStitchPlan(candidate);
  const fresh =
    !!draft && draft.base === project && draft.key === JSON.stringify(options);
  const previewColors = useMemo(
    () => mapColors(project, options),
    [project, options],
  );
  const beforeMetrics = plan ? planMetrics(plan) : null,
    afterMetrics = fresh && after.plan ? planMetrics(after.plan) : null;
  const change = (patch: Partial<OptimizeOptions>) =>
    setOptions((o) => ({ ...o, ...patch }));
  async function preview() {
    const base = project,
      key = JSON.stringify(options);
    try {
      const result = await task.run({
        kind: "optimize",
        project: base,
        options,
        seed: createId(),
      });
      setDraft({ base, key, result });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  const metrics: [
    keyof NonNullable<typeof beforeMetrics>,
    string,
    (n: number) => string,
  ][] = [
    ["colors", "Colour changes", (n) => String(n)],
    ["trims", "Trims", (n) => String(n)],
    ["travel", "Jump travel", (n) => measure.length(n)],
    ["stitches", "Needle stitches", (n) => n.toLocaleString()],
    ["minutes", "Estimated time", (n) => `${n.toFixed(1)} min`],
  ];
  return (
    <section className="feature-workspace optimize-workspace">
      <div className="feature-heading">
        <div>
          <span className="eyebrow">Make every stitch intentional</span>
          <h1>A smarter path through your design.</h1>
          <p>
            Compare sewing order, connectors and colour choices before changing
            your embroidery.
          </p>
        </div>
        <div className="row">
          <button
            className="button"
            disabled={task.busy || !project.objects.length}
            onClick={() => void preview()}
          >
            {task.busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Preview optimization
          </button>
          <button
            className="button primary"
            disabled={
              !fresh || task.busy || after.busy || !after.plan || !!after.error
            }
            onClick={() => {
              if (draft) {
                onApply(draft.result.project);
                toast.success(
                  "Optimization applied. Undo returns to the original design.",
                );
              }
            }}
          >
            <Check size={16} />
            Apply to studio
          </button>
        </div>
      </div>
      <div className="optimize-layout">
        <aside className="feature-card optimize-controls">
          <h2>
            <GitBranch size={18} />
            Sewing structure
          </h2>
          <label className="toggle-row">
            Reduce colour changes
            <Switch
              checked={options.sequence}
              onCheckedChange={(sequence) => change({ sequence })}
            />
          </label>
          <p className="help-text">
            Keep every possible stitched overlap in its current order. Locked
            objects stay in place; grouped passes retain their order.
          </p>
          <label className="toggle-row">
            Prefer closer entries
            <Switch
              checked={options.nearest}
              onCheckedChange={(nearest) => change({ nearest })}
            />
          </label>
          <p className="help-text">
            Choose nearby eligible objects. Open running and bean paths can
            reverse unless their direction is locked.
          </p>
          <div className="control-divider" />
          <h2>
            <Scissors size={18} />
            Connectors & coverage
          </h2>
          <Range
            label="Allow untrimmed jumps up to"
            value={options.trimDistance}
            min={0}
            max={5}
            step={0.1}
            unit=" mm"
            onChange={(trimDistance) => change({ trimDistance })}
          />
          <p className="help-text">
            Short same-colour jumps leave a floating thread. Tie stitches
            remain; forced trims and colour-change trims are preserved. Set zero
            to keep every trim.
          </p>
          <label className="toggle-row">
            Remove hidden fill overlaps
            <Switch
              checked={options.removeOverlaps}
              onCheckedChange={(removeOverlaps) => change({ removeOverlaps })}
            />
          </label>
          {options.removeOverlaps && (
            <>
              <Range
                label="Retain edge overlap"
                value={options.allowance}
                min={0}
                max={1}
                step={0.05}
                unit=" mm"
                onChange={(allowance) => change({ allowance })}
              />
              <p className="help-text">
                Cuts lower solid fills beneath later solid fills. Review the
                stitch direction of every resulting fragment.
              </p>
            </>
          )}
          <div className="control-divider" />
          <h2>
            <Palette size={18} />
            Colour intent
          </h2>
          <label className="toggle-row">
            Merge similar colours
            <Switch
              checked={options.mergeColors}
              onCheckedChange={(mergeColors) => change({ mergeColors })}
            />
          </label>
          <Choice
            label="Colour difference formula"
            value={options.metric ?? "de2000"}
            onChange={(metric) =>
              change({ metric: metric as "de2000" | "de76" })
            }
            options={[
              { value: "de2000", label: "CIEDE2000 · perceptual" },
              { value: "de76", label: "CIELAB ΔE76 · legacy" },
            ]}
          />
          <label className="toggle-row">
            Protect touching colours
            <Switch
              checked={options.preserveContrast !== false}
              onCheckedChange={(preserveContrast) =>
                change({ preserveContrast })
              }
            />
          </label>
          <p className="help-text">
            Keeps contrast between regions whose bounds touch or overlap. Turn
            off to merge those shades too. Colour locks always apply.
          </p>
          {options.mergeColors ? (
            <>
              <Range
                label={`Maximum colour distance · ${options.metric === "de76" ? "ΔE76" : "ΔE00"}`}
                value={options.tolerance}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(tolerance) => change({ tolerance })}
              />
              <p className="help-text">
                Map nearby sRGB colours to an existing swatch. This estimates
                visual distance; match physical thread with a thread chart.
              </p>
            </>
          ) : (
            <p className="help-text">
              All hex colours remain exact. Turn merging on only when you want
              fewer distinct thread colours.
            </p>
          )}
          <div className="protected-colors">
            {previewColors.map((c) => (
              <div key={c.from}>
                <span className="tiny-swatch" style={{ background: c.from }} />
                <code>{c.from.toUpperCase()}</code>
                <IconButton
                  label={`${c.protected ? "Unprotect" : "Protect"} colour ${c.from}`}
                  active={c.protected}
                  disabled={project.objects.some(
                    (o) =>
                      o.color.toLowerCase() === c.from &&
                      (o.locked || o.colorLocked),
                  )}
                  onClick={() =>
                    change({
                      protectedColors: options.protectedColors.includes(c.from)
                        ? options.protectedColors.filter((x) => x !== c.from)
                        : [...options.protectedColors, c.from],
                    })
                  }
                >
                  {c.protected ? <LockKeyhole /> : <UnlockKeyhole />}
                </IconButton>
              </div>
            ))}
          </div>
          <p className="help-text">
            Protect critical brand and detail colours here. Object colour locks
            also apply.
          </p>
        </aside>
        <div className="optimize-main">
          <div className="optimization-metrics">
            {metrics.map(([key, label, format]) => {
              const a = beforeMetrics?.[key],
                b = afterMetrics?.[key];
              return (
                <div key={key}>
                  <span>{label}</span>
                  <strong>{a === undefined ? "—" : format(a)}</strong>
                  <div
                    className={
                      b !== undefined && a !== undefined
                        ? b < a
                          ? "metric-better"
                          : b > a
                            ? "metric-more"
                            : ""
                        : ""
                    }
                  >
                    <ArrowRight size={13} />
                    {b === undefined ? "Preview to compare" : format(b)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="comparison-toolbar">
            <div>
              <strong>
                {fresh
                  ? "Compare the proposed design"
                  : draft
                    ? "Settings changed · refresh the preview"
                    : "Your original design is ready"}
              </strong>
              <p className="help-text">
                {fresh
                  ? `${draft.result.moved} objects moved · ${draft.result.reversed} running paths reversed · ${draft.result.overlaps} fills cut back`
                  : "Choose the changes you want, then preview. Your artwork stays editable throughout."}
              </p>
            </div>
            <Tabs value={view} onValueChange={(v) => setView(v as CanvasView)}>
              <TabsList>
                <TabsTrigger value="stitches">Stitches</TabsTrigger>
                <TabsTrigger value="artwork">Artwork</TabsTrigger>
                <TabsTrigger value="density">Density</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="optimization-previews">
            <PlanPreview
              project={project}
              plan={plan}
              view={view}
              label="Original"
            />
            {draft ? (
              <PlanPreview
                project={candidate}
                plan={after.plan}
                view={view}
                label={fresh ? "Proposed" : "Previous preview"}
              />
            ) : (
              <div className="optimization-empty">
                <Route size={35} />
                <strong>See the impact before you apply.</strong>
                <p>
                  Actual stitch paths, travel and thread changes will appear
                  here.
                </p>
                <button
                  className="button soft"
                  disabled={task.busy || !project.objects.length}
                  onClick={() => void preview()}
                >
                  Preview optimization
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
          {after.busy && draft && (
            <p className="inline-status">
              <Loader2 size={15} className="animate-spin" />
              Generating the proposed stitch structure…
            </p>
          )}
          {after.error && draft && (
            <p role="alert" className="issue error">
              {after.error}
            </p>
          )}
          {draft?.result.notes.map((note) => (
            <p className="operation-note" key={note}>
              {note}
            </p>
          ))}
          <div className="feature-card mapping-card">
            <h2>
              <Palette size={17} />
              Exact colour mapping{" "}
              <span className="badge">
                {options.mergeColors ? "Proposed palette" : "Colours preserved"}
              </span>
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original</TableHead>
                  <TableHead>Proposed</TableHead>
                  <TableHead>
                    {options.metric === "de76" ? "ΔE76" : "ΔE00"}
                  </TableHead>
                  <TableHead>Objects</TableHead>
                  <TableHead>Protection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewColors.map((c) => (
                  <TableRow key={c.from}>
                    <TableCell>
                      <span className="mapping-swatch">
                        <i style={{ background: c.from }} />
                        {c.from.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="mapping-swatch">
                        <i style={{ background: c.to }} />
                        {c.to.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>{c.delta.toFixed(2)}</TableCell>
                    <TableCell>{c.objects}</TableCell>
                    <TableCell>
                      {c.protected ? (
                        <span className="row">
                          <LockKeyhole size={13} />
                          Exact
                        </span>
                      ) : c.from === c.to ? (
                        "Kept"
                      ) : (
                        "Merge proposed"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="help-text">
              Time estimates use 700 stitches/minute plus trim and colour-change
              allowances. Actual machine timing and sew-out results may differ.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
