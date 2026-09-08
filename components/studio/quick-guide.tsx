"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  SHORTCUTS,
  CONTEXT_KEYS,
  NATIVE_ONLY_KEYS,
} from "@/lib/embroidery/shortcuts";

const STEPS = [
  {
    title: "Your creative workspace",
    workspace: "studio",
    anchor: "canvas",
    text: "Choose millimetres or inches above. Artwork dimensions have no fixed maximum, and fields accept values such as 18in or 1200mm. Freeform mode extends beyond a hoop; set fabric and dimensions in Properties.",
  },
  {
    title: "Prepare intricate artwork",
    workspace: "convert",
    anchor: "convert",
    text: "Import SVG, PNG, JPG or WebP. Set the physical width first, then tune colours, resolution and contour tolerance. Pixel-detail protection checks the trace against the bitmap; use the overlay to inspect fine edges.",
  },
  {
    title: "Draw with intention",
    workspace: "studio",
    anchor: "tools",
    text: "Choose Column A for paired points, B for separate edges, or C for a centreline. Left-click makes corners and right-click makes curves. Corner/Curve buttons also work with touch. Enter finishes; Backspace removes a point.",
  },
  {
    title: "Choose the stitch language",
    workspace: "studio",
    anchor: "properties",
    text: "Select an object and open Stitch methods. Try satin, raised satin, tatami, motif fills, coils or partial crosses. Adjust physical spacing, stitch length, underlay and connectors. The Cross chart lets you paint individual cells.",
  },
  {
    title: "Review auto-digitizing",
    workspace: "studio",
    anchor: "auto",
    text: "Auto-digitize proposes turning satin for suitable narrow shapes and tatami for larger regions. Preview first: each region has a reason and detail checks. Apply is one undoable edit.",
  },
  {
    title: "Refine colour and sequence",
    workspace: "optimize",
    anchor: "optimize",
    text: "Preview sewing order, connector travel and optional colour merges. Protect exact colours and touching regions, compare the draft, then apply. In Analysis, inspect elements or merge a specific pair of colours.",
  },
  {
    title: "Follow every stitch",
    workspace: "studio",
    anchor: "player",
    text: "Play the stitch progression or open the Stitch list. Home/End travel to the beginning/end; PgUp/PgDn jump between colours. Reveal connectors and density to inspect the sewing structure.",
  },
  {
    title: "Collect ideas",
    workspace: "inspiration",
    anchor: "inspiration",
    text: "Keep references and palettes beside your design. Public inspiration searches open in a new tab. Connecting a personal Pinterest account requires the configured Pinterest integration.",
  },
  {
    title: "Check and hand off",
    workspace: "production",
    anchor: "production",
    text: "Review machine dimensions and production checks. Export DST with its thread order, or download approval PDFs and 1:1 cutting templates. Save a project to preserve editable objects and revisions. Record an actual sew-out before production.",
  },
];
export default function QuickGuide({
  open,
  onOpenChange,
  onWorkspace,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onWorkspace: (workspace: string) => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) onWorkspace(STEPS[step].workspace);
  }, [open, step, onWorkspace]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="quick-guide-dialog">
        <DialogHeader>
          <div className="guide-step-label">
            Quick start · {step + 1} of {STEPS.length}
          </div>
          <DialogTitle>{STEPS[step].title}</DialogTitle>
          <DialogDescription>{STEPS[step].text}</DialogDescription>
        </DialogHeader>
        <div
          className="guide-progress"
          aria-label={`Step ${step + 1} of ${STEPS.length}`}
        >
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              aria-label={`Guide step ${i + 1}: ${s.title}`}
              aria-current={i === step ? "step" : undefined}
              className={i === step ? "active" : ""}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        <div className="row between">
          <button className="text-button" onClick={() => onOpenChange(false)}>
            Close guide
          </button>
          <div className="row">
            <button
              className="button"
              disabled={!step}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
            <button
              className="button primary"
              onClick={() =>
                step === STEPS.length - 1
                  ? onOpenChange(false)
                  : setStep((s) => s + 1)
              }
            >
              {step === STEPS.length - 1 ? "Start creating" : "Next"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function ShortcutReference({
  onQuickGuide,
}: {
  onQuickGuide: () => void;
}) {
  const [query, setQuery] = useState("");
  const results = SHORTCUTS.filter((s) =>
    `${s.label} ${s.display} ${s.group}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="row between">
        <input
          className="text-input"
          aria-label="Search keyboard shortcuts"
          placeholder="Search a key, command or tool…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="button" onClick={onQuickGuide}>
          Quick start tour
        </button>
      </div>
      <p className="help-text">
        Wilcom-style keys for supported commands. Ctrl also accepts ⌘ on Mac.
        Keys marked “Browser” may be intercepted by your browser or operating
        system; the same actions remain available through menus and Find a
        command. Tab selects objects only while the canvas has focus.
      </p>
      <div className="shortcut-scroll">
        <table className="shortcut-table">
          <thead>
            <tr>
              <th>Command</th>
              <th>Key</th>
              <th>Scope</th>
            </tr>
          </thead>
          <tbody>
            {results.map((s, i) => (
              <tr key={`${s.id}-${i}`}>
                <td>
                  {s.label}
                  {s.note && <small>{s.note}</small>}
                </td>
                <td>
                  <kbd>{s.display}</kbd>
                </td>
                <td>
                  {s.group}
                  {s.browser && <small>Browser</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Drawing keys and gestures</summary>
        <div className="context-key-list">
          {CONTEXT_KEYS.map(([key, help]) => (
            <p key={key}>
              <strong>{key}</strong> {help}
            </p>
          ))}
        </div>
      </details>
      <details>
        <summary>Native Wilcom commands not implemented here</summary>
        <div className="context-key-list">
          {NATIVE_ONLY_KEYS.map(([key, help]) => (
            <p key={key}>
              <strong>{key}</strong> {help}
            </p>
          ))}
        </div>
        <p className="help-text">
          Space while digitizing follows the draft corner/curve behaviour here;
          Wilcom’s omit-last-stitch column completion is not implemented. No
          shortcut silently substitutes for a specialty machine function.
        </p>
      </details>
      <a
        className="text-button"
        href="https://productblog.wilcom.com/wp-content/uploads/2020/05/Masterclass1-Shortcuts.pdf"
        target="_blank"
        rel="noopener noreferrer"
      >
        Wilcom’s published keyboard reference ↗
      </a>
    </>
  );
}
