"use client";
import { useState, type ReactNode } from "react";
import { controlHelp } from "@/lib/embroidery/control-help";
import { parseMeasurement } from "@/lib/embroidery/units";
import { useMeasurements } from "./measurement-units";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function IconButton({
  label,
  help,
  children,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`icon-button ${active ? "active" : ""}`}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="studio-tooltip">
        <strong>{label}</strong>
        {(help ?? controlHelp(label)) && <p>{help ?? controlHelp(label)}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
export function HelpTip({ label }: { label: string }) {
  const help = controlHelp(label);
  const [open, setOpen] = useState(false);
  if (!help) return null;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="help-tip"
          aria-label={`Help: ${label}`}
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          ?
        </button>
      </TooltipTrigger>
      <TooltipContent className="studio-tooltip" side="top">
        {help}
      </TooltipContent>
    </Tooltip>
  );
}
export function Choice({
  value,
  onChange,
  label,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger aria-label={label} className="select-full">
            <SelectValue />
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent className="studio-tooltip">
          {controlHelp(label) ?? label}
        </TooltipContent>
      </Tooltip>
      <SelectContent>
        {options.map((o) => (
          <SelectItem value={o.value} key={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const measure = useMeasurements();
  const local = preview ?? value;
  return (
    <div className="field">
      <div className="field-label">
        <span>
          {label}
          <HelpTip label={label} />
        </span>
        <span className="field-value">
          {unit.trim() === "mm" ? (
            measure.length(local)
          ) : (
            <>
              {step < 1 ? local.toFixed(2) : Math.round(local)}
              {unit}
            </>
          )}
        </span>
      </div>
      <Slider
        aria-label={label}
        disabled={disabled}
        value={[local]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => setPreview(v[0])}
        onValueCommit={(v) => {
          setPreview(null);
          onChange(v[0]);
        }}
      />
    </div>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = null,
  unit = "mm",
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number | null;
  max?: number | null;
  unit?: string;
  disabled?: boolean;
}) {
  const measure = useMeasurements();
  const physical = unit.trim() === "mm",
    shownUnit = physical ? measure.unit : unit;
  const [draft, setDraft] = useState<{ text: string; unit: string } | null>(
    null,
  );
  const display = physical
    ? measure.number(value)
    : String(Number(value.toFixed(2)));
  const local = draft?.unit === shownUnit ? draft.text : display;
  const apply = () => {
    if (local === display) {
      setDraft(null);
      return;
    }
    const n = physical ? parseMeasurement(local, measure.unit) : Number(local);
    setDraft(null);
    if (
      local.trim() &&
      Number.isFinite(n) &&
      (min === null || n >= min) &&
      (max === null || n <= max)
    ) {
      if (Math.abs(n - value) > 0.001) onChange(n);
    } else {
      toast.error(
        min === null && max === null
          ? `Use a finite value in ${shownUnit}.`
          : max === null
            ? `Use a finite value of at least ${physical ? measure.length(min!) : min + " " + unit}.`
            : min === null
              ? `Use a finite value no greater than ${physical ? measure.length(max) : max + " " + unit}.`
              : `Use a value between ${physical ? measure.number(min) : min} and ${physical ? measure.length(max) : max + " " + unit}.`,
      );
    }
  };
  return (
    <label>
      <span className="small-label">
        {label}
        <HelpTip label={label} />
      </span>
      <div className="number-box">
        <input
          aria-label={label}
          disabled={disabled}
          type={physical ? "text" : "number"}
          inputMode="decimal"
          min={physical ? undefined : (min ?? undefined)}
          max={physical ? undefined : (max ?? undefined)}
          step=".1"
          value={local}
          onChange={(e) => setDraft({ text: e.target.value, unit: shownUnit })}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(null);
            if (physical && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              const current = parseMeasurement(local, measure.unit);
              if (!Number.isFinite(current)) return;
              const increment =
                (measure.unit === "in" ? 0.01 * 25.4 : 0.1) *
                (e.shiftKey ? 10 : 1);
              const next = Math.max(
                min ?? -Infinity,
                Math.min(
                  max ?? Infinity,
                  current + (e.key === "ArrowUp" ? increment : -increment),
                ),
              );
              setDraft({ text: measure.number(next), unit: shownUnit });
            }
          }}
        />
        <span>{shownUnit}</span>
      </div>
    </label>
  );
}
export function download(
  data: Uint8Array | string,
  name: string,
  type: string,
) {
  const blob = new Blob(
    [typeof data === "string" ? data : new Uint8Array(data)],
    { type },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.hidden = true;
  // Attaching the link supports browsers that ignore detached download links.
  // Keep the blob alive while the browser hands the file to its download manager.
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const fileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "embroidery";
let sessionReady: Promise<void> | null = null;
export function resetStudioSession() {
  sessionReady = null;
}
async function ensureStudioSession() {
  if (!sessionReady)
    sessionReady = fetch("/api/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(20000),
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            "Your private studio could not be initialized. Please retry.",
          );
      })
      .catch((error) => {
        sessionReady = null;
        throw error;
      });
  await sessionReady;
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  await ensureStudioSession();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    credentials: "same-origin",
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(20000),
  });
  if (response.status === 401) sessionReady = null;
  const data = await response.json().catch(() => {
    throw new ApiError(
      response.status,
      "The studio did not return a valid response. Please retry.",
    );
  });
  if (!data || typeof data !== "object")
    throw new ApiError(
      response.status,
      "The studio returned an incomplete response. Please retry.",
    );
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error ?? "This request could not be completed.",
    );
  if (url.startsWith("/api/projects") && data.projectDownload) {
    const { readProjectDownload } = await import(
      "@/lib/client/project-download"
    );
    data.project = await readProjectDownload(data.projectDownload);
    delete data.projectDownload;
  }
  return data as T;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
