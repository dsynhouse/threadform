"use client";
import { createId } from "@/lib/embroidery/id";
import { machinePreflight } from "@/lib/embroidery/machine-settings";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Download,
  FileCheck2,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FABRICS,
  type Project,
  type SewOut,
  type StitchPlan,
} from "@/lib/embroidery/types";
import { designFingerprint } from "@/lib/embroidery/operations";
import { Choice, NumberField, download, fileName } from "./controls";
import ReleaseChecklist from "./release-checklist";
import MachineProgram from "./machine-program";
import { exportNative } from "@/lib/embroidery/native-export";
import { toast } from "sonner";
import { fileHash } from "@/lib/embroidery/file-hash";
import { useMeasurements } from "./measurement-units";
export default function Production({
  project,
  plan,
  busy,
  onChange,
  onSelect,
  onExport,
}: {
  project: Project;
  plan: StitchPlan | null;
  busy: boolean;
  onChange: (project: Project) => void;
  onSelect: (ids: string[]) => void;
  onExport: () => void;
}) {
  const measure = useMeasurements();
  const [open, setOpen] = useState(false),
    [form, setForm] = useState({
      machine: "",
      fabric: "",
      stabilizer: "",
      thread: "40 wt polyester",
      needle: "",
      speed: 700,
      result: "pending" as SewOut["result"],
      notes: "",
      format: "dst" as NonNullable<SewOut["format"]>,
      fileSha256: "",
      firmware: "",
      operator: "",
      evidenceURL: "",
      controllerAccepted: false,
      measuredWidth: 0,
      measuredHeight: 0,
      threadBreaks: 0,
    });
  const fingerprint = designFingerprint(project),
    records = project.sewOuts ?? [],
    matching = records.filter((r) => r.designFingerprint === fingerprint),
    passed = matching.some(
      (r) =>
        r.result === "passed" &&
        r.fileSha256 &&
        r.controllerAccepted &&
        r.firmware &&
        r.operator &&
        r.evidenceURL,
    ),
    errors = plan?.issues.filter((i) => i.level === "error") ?? [];
  function report() {
    download(
      JSON.stringify(
        {
          design: project.name,
          fingerprint,
          dimensionsMM: {
            width: project.width,
            height: project.height,
            hoopWidth: project.hoopWidth,
            hoopHeight: project.hoopHeight,
          },
          fabric: project.fabric,
          generatedAt: new Date().toISOString(),
          stitchCount: plan?.stitchCount ?? 0,
          colorChanges: plan?.colorChanges ?? 0,
          trimCount: plan?.trimCount ?? 0,
          issues: plan?.issues ?? [],
          sewOuts: records,
          notes: project.notes,
          status: passed
            ? "User-recorded sew-out pass for this design"
            : "Physical sew-out pending",
        },
        null,
        2,
      ),
      fileName(project.name) + "-production-report.json",
      "application/json",
    );
  }
  return (
    <section className="feature-workspace">
      <div className="feature-heading">
        <div>
          <span className="eyebrow">From studio to fabric</span>
          <h1>Production desk</h1>
          <p>
            Review the design, export a machine file and keep the results of
            real sew-outs.
          </p>
        </div>
        <div className="row">
          <button className="button" onClick={report}>
            <Download size={16} />
            Production report
          </button>
          <button
            className="button primary"
            disabled={busy || !plan?.stitchCount || errors.length > 0}
            onClick={onExport}
          >
            Export machine files
          </button>
        </div>
      </div>
      <div className="production-grid">
        <ReleaseChecklist project={project} plan={plan} />
        <MachineProgram project={project} onChange={onChange} />
      </div>
      <div className="production-status">
        <div className={`readiness-icon ${passed ? "passed" : ""}`}>
          {passed ? <Check size={25} /> : <ClipboardCheck size={25} />}
        </div>
        <div>
          <strong>
            {passed
              ? "Sew-out pass recorded for this design"
              : "Physical sew-out pending"}
          </strong>
          <p>
            {passed
              ? "A user-recorded result matches the current design. Check that the production machine, materials and setup also match."
              : "Software checks can inspect stitch data. Fabric behaviour and stitch quality need a test on your intended machine and materials."}
          </p>
        </div>
        <span className="badge">Design {fingerprint}</span>
      </div>
      <div className="production-grid">
        <div className="feature-card">
          <h2>
            <FileCheck2 size={18} />
            Design checks
          </h2>
          <div className="check-row">
            <span>Stitch plan</span>
            <span>
              {busy
                ? "Generating…"
                : plan?.stitchCount
                  ? `${plan.stitchCount.toLocaleString()} stitches`
                  : "No stitches"}
            </span>
          </div>
          <div className="check-row">
            <span>Design workspace</span>
            <span>
              {project.workspaceMode === "freeform"
                ? "Freeform"
                : `${measure.size(project.hoopWidth, project.hoopHeight)} hoop`}
            </span>
          </div>
          <div className="check-row">
            <span>Colour changes / trims</span>
            <span>
              {plan?.colorChanges ?? "—"} / {plan?.trimCount ?? "—"}
            </span>
          </div>
          <div className="check-row">
            <span>Estimated machine time</span>
            <span>
              {plan
                ? `~${plan.estimatedMinutes.toFixed(1)} min at 700 spm`
                : "—"}
            </span>
          </div>
          <div className="production-issues">
            {plan &&
            [...plan.issues, ...machinePreflight(project, plan)].length ? (
              [...plan.issues, ...machinePreflight(project, plan)].map(
                (issue, i) => (
                  <button
                    className={`issue ${issue.level === "error" ? "error" : ""}`}
                    key={i}
                    onClick={() => issue.objectId && onSelect([issue.objectId])}
                  >
                    <AlertTriangle size={15} />
                    {issue.message}
                  </button>
                ),
              )
            ) : (
              <p className="good-note">
                <Check size={15} />
                {plan
                  ? "No geometric checks flagged this design."
                  : "Generate a stitch plan to inspect this design."}
              </p>
            )}
          </div>
          <p className="help-text">
            Checks cover generated geometry, hoop limits, thin details, spacing
            and long satin spans. They do not measure tension, thread breaks or
            fabric distortion.
          </p>
        </div>
        <div className="feature-card">
          <div className="row between">
            <h2>Sew-out log</h2>
            <button
              className="button"
              disabled={records.length >= 100}
              onClick={() => {
                setForm({
                  ...form,
                  fabric: FABRICS[project.fabric].label,
                  result: "pending",
                });
                setOpen(true);
              }}
            >
              <Plus size={15} />
              Record a test
            </button>
          </div>
          {records.length ? (
            <div className="sewout-list">
              {[...records].reverse().map((record) => (
                <article className="sewout-card" key={record.id}>
                  <div className="row between">
                    <strong>{record.machine || "Machine not specified"}</strong>
                    <span
                      className={`badge ${record.result === "passed" ? "success-badge" : ""}`}
                    >
                      {record.result === "passed"
                        ? "Passed"
                        : record.result === "revise"
                          ? "Needs revision"
                          : "Pending"}
                    </span>
                  </div>
                  <small>
                    {new Date(record.date).toLocaleDateString()} ·{" "}
                    {record.fabric} · {record.speed} spm
                  </small>
                  <p>{record.notes || "No notes added."}</p>
                  <span className="small-label">
                    {record.designFingerprint === fingerprint
                      ? "Matches current design"
                      : "Earlier design version"}{" "}
                    · {record.designFingerprint}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-log">
              <ClipboardCheck size={33} strokeWidth={1} />
              <strong>Your first test belongs here.</strong>
              <p>
                Record the machine, stabilizer, thread, needle and the changes
                the fabric tells you to make.
              </p>
            </div>
          )}
          <p className="help-text">
            Sew-out records are included in editable projects. Use Save project
            to keep them with a saved revision.
          </p>
        </div>
      </div>
      <div className="feature-card capability-note">
        <h2>Machine file requirements</h2>
        <p>
          Use the exact machine model and controller manual to set the sewing
          field, stitch count and colour-stop limits in Export. A format name
          alone does not determine a machine’s physical limits.
        </p>
        <div className="machine-format-table">
          <table>
            <thead>
              <tr>
                <th>Format / process</th>
                <th>Available in Threadform</th>
                <th>Production requirement</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Tajima DST</td>
                <td>Read needle paths · write DST package</td>
                <td>
                  0.1 mm units; maximum 12.1 mm per encoded move. Assign thread
                  colours separately and verify three-jump trim interpretation.
                </td>
              </tr>
              <tr>
                <td>Brother PES v1</td>
                <td>Native PES with CSewSeg, PEC stitches and thumbnails</td>
                <td>
                  Use the{" "}
                  <a
                    href="https://download.brother.com/welcome/doch101715/882d83_om01en.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    relevant Brother machine manual
                  </a>{" "}
                  to confirm accepted formats and limits. DST support varies by
                  model.
                </td>
              </tr>
              <tr>
                <td>Janome JEF v1</td>
                <td>
                  Native JEF with format palette and supported hoop checks
                </td>
                <td>
                  <a
                    href="https://www.janome.com/create-learn/janome-embroidery-formats/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Janome format guidance
                  </a>{" "}
                  distinguishes editable design data from machine stitch files.
                </td>
              </tr>
              <tr>
                <td>Melco / Bernina EXP</td>
                <td>Native EXP with jumps, trims and colour stops</td>
                <td>
                  Use the accompanying thread order. EXP ends at EOF. Verify the
                  target controller’s trim and pause behaviour.
                </td>
              </tr>
              <tr>
                <td>EMB / JAN source designs</td>
                <td>Not a native source editor</td>
                <td>
                  Import SVG artwork or DST needle paths; keep the original
                  source file for properties those exports cannot preserve.
                </td>
              </tr>
              <tr>
                <td>Appliqué · chenille · sequins · cording</td>
                <td>
                  Appliqué placement/tack/cover paths; decorative lockstitch
                  effects
                </td>
                <td>
                  Object pauses and single-sequin DST are available. Chenille
                  loop cutting, cording, multi-sequin and bead protocols remain
                  unsupported.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="help-text">
          No machine family is marked as qualified until a real sew-out is
          recorded for the exact design, machine and materials. Algorithm tests
          validate the data, not needle tension or fabric behaviour.
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sewout-dialog">
          <DialogHeader>
            <DialogTitle>Record a sew-out</DialogTitle>
            <DialogDescription>
              This record will refer to the current design, {fingerprint}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="dialog-body"
            onSubmit={async (event) => {
              event.preventDefault();
              if (form.result === "passed") {
                if (
                  !plan ||
                  form.measuredWidth <= 0 ||
                  form.measuredHeight <= 0
                ) {
                  toast.error(
                    "Enter the measured sew-out dimensions before recording a pass.",
                  );
                  return;
                }
                try {
                  const bytes = exportNative(project, plan, form.format);
                  const actual = fileHash(bytes);
                  if (actual !== form.fileSha256.toLowerCase()) {
                    toast.error(
                      "The file hash does not match this design and format. Export the current version or reopen the tested version.",
                    );
                    return;
                  }
                } catch (e) {
                  toast.error(
                    e instanceof Error
                      ? e.message
                      : "Unable to verify machine file.",
                  );
                  return;
                }
              }
              const record: SewOut = {
                ...form,
                fileSha256: form.fileSha256 || undefined,
                id: createId(),
                date: new Date().toISOString(),
                designFingerprint: fingerprint,
              };
              onChange({ ...project, sewOuts: [...records, record] });
              setOpen(false);
            }}
          >
            <div className="two-fields">
              {(
                [
                  ["machine", "Machine / model"],
                  ["fabric", "Fabric"],
                  ["stabilizer", "Stabilizer & hooping"],
                  ["thread", "Thread"],
                  ["needle", "Needle"],
                  ["firmware", "Controller firmware"],
                  ["operator", "Operator / inspector"],
                  ["evidenceURL", "Sew-out evidence reference or URL"],
                ] as const
              ).map(([key, label]) => (
                <label className="form-field" key={key}>
                  {label}
                  <input
                    value={form[key]}
                    maxLength={200}
                    required={
                      key === "machine" ||
                      key === "fabric" ||
                      form.result === "passed"
                    }
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <NumberField
                label="Machine speed"
                value={form.speed}
                min={100}
                max={1500}
                unit="spm"
                onChange={(speed) => setForm({ ...form, speed })}
              />
            </div>
            <div className="two-fields">
              <Choice
                label="Tested file format"
                value={form.format}
                options={["dst", "pes", "jef", "exp"].map((v) => ({
                  value: v,
                  label: v.toUpperCase(),
                }))}
                onChange={(v) =>
                  setForm({ ...form, format: v as typeof form.format })
                }
              />
              <label className="form-field">
                Exported file SHA-256
                <input
                  className="text-input"
                  value={form.fileSha256}
                  pattern="[a-fA-F0-9]{64}"
                  minLength={64}
                  maxLength={64}
                  required={form.result === "passed"}
                  placeholder="Copy from the exported manifest"
                  onChange={(e) =>
                    setForm({ ...form, fileSha256: e.target.value })
                  }
                />
              </label>
              <NumberField
                label="Measured width"
                value={form.measuredWidth}
                min={0}
                max={null}
                unit="mm"
                onChange={(v) => setForm({ ...form, measuredWidth: v })}
              />
              <NumberField
                label="Measured height"
                value={form.measuredHeight}
                min={0}
                max={null}
                unit="mm"
                onChange={(v) => setForm({ ...form, measuredHeight: v })}
              />
              <NumberField
                label="Thread breaks"
                value={form.threadBreaks}
                min={0}
                max={10000}
                unit=""
                onChange={(v) =>
                  setForm({ ...form, threadBreaks: Math.round(v) })
                }
              />
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={form.controllerAccepted}
                required={form.result === "passed"}
                onChange={(e) =>
                  setForm({ ...form, controllerAccepted: e.target.checked })
                }
              />{" "}
              File loaded and decoded on the intended controller
            </label>
            <Choice
              label="Test result"
              value={form.result}
              onChange={(result) =>
                setForm({ ...form, result: result as SewOut["result"] })
              }
              options={[
                { value: "pending", label: "Pending — not sewn yet" },
                { value: "revise", label: "Sewn — needs revision" },
                { value: "passed", label: "Sewn — passed my inspection" },
              ]}
            />
            <label className="form-field">
              Observations & changes
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={2000}
                rows={4}
                placeholder="Coverage, registration, puckering, thread breaks…"
              />
            </label>
            <button className="button primary" type="submit">
              Add sew-out record
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
