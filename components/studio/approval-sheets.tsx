"use client";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { FileDown, Loader2, ExternalLink } from "lucide-react";
import type { Project, StitchPlan } from "@/lib/embroidery/types";
import type { ApprovalOptions } from "@/lib/embroidery/approval-pdf";
import { Choice, fileName, errorMessage } from "./controls";
export default function ApprovalSheets({
  open,
  onOpenChange,
  project,
  plan,
  onProject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  plan: StitchPlan | null;
  onProject: (p: Project) => void;
}) {
  const [options, setOptions] = useState<ApprovalOptions>({
      paper: "a4",
      view: "stitches",
      actualSize: false,
    }),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const worker = useRef<Worker | null>(null),
    generation = useRef(0);
  const details = project.approval ?? {
    client: "",
    reference: "",
    preparedBy: "DSYN House",
    notes: "",
  };
  useEffect(() => {
    // Invalidate the previously generated PDF immediately when its input changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl("");
    setBusy(false);
    generation.current++;
    worker.current?.terminate();
  }, [project, options, open]);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const generate = () => {
    if (!plan) return;
    const id = ++generation.current;
    worker.current?.terminate();
    setBusy(true);
    setError("");
    try {
      const w = new Worker(
        new URL("../../lib/embroidery/pdf-worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      const timeout = setTimeout(() => {
        w.terminate();
        if (generation.current === id) {
          setBusy(false);
          setError(
            "PDF generation exceeded the time limit. Try artwork view or disable actual-size pages.",
          );
        }
      }, 40000);
      w.onmessage = (e) => {
        clearTimeout(timeout);
        w.terminate();
        if (generation.current !== id) return;
        setBusy(false);
        if (e.data.error) setError(e.data.error);
        else
          setUrl(
            URL.createObjectURL(
              new Blob([e.data.data], { type: "application/pdf" }),
            ),
          );
      };
      w.onerror = () => {
        clearTimeout(timeout);
        w.terminate();
        if (generation.current === id) {
          setBusy(false);
          setError("PDF worker could not finish. Try artwork view.");
        }
      };
      w.postMessage({ project, plan, options });
    } catch (e) {
      setBusy(false);
      setError(errorMessage(e));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="approval-dialog">
        <DialogHeader>
          <DialogTitle>Approval sheets & print preview</DialogTitle>
          <DialogDescription>
            A downloadable PDF with design proof, dimensions, stitch sequence,
            thread references and approval fields. Optional tiled templates
            print at actual size.
          </DialogDescription>
        </DialogHeader>
        <div className="approval-layout">
          <div className="approval-settings">
            <div className="two-fields">
              <Choice
                label="Paper size"
                value={options.paper}
                onChange={(v) =>
                  setOptions({
                    ...options,
                    paper: v as ApprovalOptions["paper"],
                  })
                }
                options={[
                  { value: "a4", label: "A4" },
                  { value: "letter", label: "US Letter" },
                ]}
              />
              <Choice
                label="Proof view"
                value={options.view}
                onChange={(v) =>
                  setOptions({ ...options, view: v as ApprovalOptions["view"] })
                }
                options={[
                  { value: "stitches", label: "Stitch proof" },
                  { value: "artwork", label: "Vector artwork" },
                ]}
              />
            </div>
            {(["client", "reference", "preparedBy"] as const).map((key) => (
              <label key={key} className="small-label">
                {key === "preparedBy"
                  ? "Prepared by"
                  : key[0].toUpperCase() + key.slice(1)}
                <input
                  className="text-input"
                  maxLength={key === "client" ? 200 : 100}
                  value={details[key]}
                  onChange={(e) =>
                    onProject({
                      ...project,
                      approval: { ...details, [key]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            <label className="small-label">
              Approval notes
              <textarea
                className="text-input"
                rows={4}
                maxLength={2000}
                value={details.notes}
                onChange={(e) =>
                  onProject({
                    ...project,
                    approval: { ...details, notes: e.target.value },
                  })
                }
              />
            </label>
            <label className="toggle-row">
              Add actual-size tiled pages
              <Switch
                checked={!!options.actualSize}
                onCheckedChange={(actualSize) =>
                  setOptions({ ...options, actualSize })
                }
              />
            </label>
            <p className="help-text">
              Templates work with freeform designs. Print at 100% and check the
              20 mm scale mark. The front approval sheet is fitted to the page.
            </p>
            <button
              className="button primary full"
              disabled={!plan || busy}
              onClick={generate}
            >
              {busy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <FileDown size={16} />
              )}{" "}
              {busy ? "Preparing PDF…" : "Generate print preview"}
            </button>
            {url && (
              <div className="row">
                <a
                  className="button primary"
                  href={url}
                  download={fileName(project.name) + "-approval.pdf"}
                >
                  Download PDF
                </a>
                <a
                  className="button"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={15} />
                  Open / Print
                </a>
              </div>
            )}
            {error && (
              <p className="issue error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="approval-preview">
            {url ? (
              <iframe title="Embroidery approval PDF print preview" src={url} />
            ) : (
              <div className="empty-art">
                <FileDown size={34} />
                <strong>Your proof, ready for approval</strong>
                <span>
                  Generate a preview after setting the project details.
                </span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
