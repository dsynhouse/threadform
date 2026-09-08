/* eslint-disable @next/next/no-img-element -- Use the original local bitmap without lossy image optimization for digitizing. */
"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  FileImage,
  Loader2,
  Upload,
  Download,
  Layers3,
  Palette,
  ScanLine,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { importSVG } from "@/lib/embroidery/svg-import";
import { resizeProject } from "@/lib/embroidery/project";
import { assertGeometryBudget } from "@/lib/embroidery/complexity";
import { useMeasurements } from "./measurement-units";
import { separateElements, analyzeColors } from "@/lib/embroidery/operations";
import { exportSVG } from "@/lib/embroidery/export";
import type { Project, EmbroideryObject } from "@/lib/embroidery/types";
import type { TraceOptions } from "@/lib/embroidery/raster";
import {
  Choice,
  Range,
  NumberField,
  download,
  fileName,
  errorMessage,
} from "./controls";
import TraceComparison from "./trace-comparison";
import { VectorPreview } from "./vector-preview";
import { createId } from "@/lib/embroidery/id";
import {
  latestConversion,
  writeConversion,
  type ConversionDraft,
  rememberArtwork,
  cachedArtwork,
} from "@/lib/client/recovery";
import { attachSourceLayer } from "@/lib/embroidery/artwork-layer";
import { uploadArtwork, openArtwork } from "@/lib/client/artwork-storage";
import { toast } from "sonner";
export default function Converter({
  incoming,
  onApply,
  namespace,
  originalProject,
}: {
  incoming: File | null;
  onApply: (project: Project) => void;
  namespace: string;
  originalProject?: Project;
}) {
  const measure = useMeasurements();
  const original = originalProject?.artwork;
  const [detail, setDetail] = useState("balanced");
  const [corrections, setCorrections] = useState<Project[]>([]);
  const [correctionColor, setCorrectionColor] = useState("#21776a");
  const [restored, setRestored] = useState(false),
    [recoveryStatus, setRecoveryStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const restoredFile = useRef<File | null>(null),
    recoveryDraft = useRef<ConversionDraft | null>(null);
  const draftId = useRef(""),
    assetId = useRef("");
  const incomingRef = useRef(incoming);
  useLayoutEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);
  const [file, setFile] = useState<File | null>(incoming),
    [preview, setPreview] = useState(""),
    [vector, setVector] = useState<Project | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [split, setSplit] = useState(true),
    [stale, setStale] = useState(false);
  const [options, setOptions] = useState<TraceOptions>({
    colors: 8,
    resolution: 1024,
    minArea: 0,
    removeWhite: true,
    backgroundMode: "border",
    widthMM: 160,
    simplifyMM: 0.06,
    preserveHoles: true,
    preservePixels: true,
    smoothCurves: true,
    islandAction: "merge",
    mode: "regions",
  });
  const input = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    generation = useRef(0);
  const isSVG = !!file && /\.svg$/i.test(file.name);
  const [lastIncoming, setLastIncoming] = useState(incoming);
  if (lastIncoming !== incoming) {
    setLastIncoming(incoming);
    if (incoming) setFile(incoming);
  }
  useEffect(() => {
    let active = true;
    draftId.current = createId();
    assetId.current = createId();
    void latestConversion(namespace)
      .then((draft) => {
        if (!active) return;
        if (draft && !incomingRef.current) {
          restoredFile.current = draft.file;
          assetId.current = draft.assetId || createId();
          setFile(draft.file);
          setVector(draft.vector);
          setOptions(draft.options);
          setSelected(draft.selected);
          setSplit(draft.split);
          setStale(draft.stale);
          setDetail(draft.detail);
          setRecoveryStatus("Conversion restored from this device.");
        }
        setRestored(true);
      })
      .catch(() => {
        if (active) {
          setRestored(true);
          setRecoveryStatus(
            "Conversion recovery is unavailable. Download your vectors before closing.",
          );
        }
      });
    return () => {
      active = false;
      if (recoveryDraft.current)
        void writeConversion(recoveryDraft.current).catch(() => {});
    };
  }, [namespace]);
  useEffect(() => {
    if (!restored || !file || !namespace) return;
    const draft: ConversionDraft = {
      id: draftId.current,
      namespace,
      updatedAt: Date.now(),
      file,
      vector,
      options,
      selected,
      split,
      stale,
      detail,
      assetId: assetId.current,
    };
    recoveryDraft.current = draft;
    const timer = setTimeout(() => {
      void writeConversion(draft)
        .then(() => setRecoveryStatus("Conversion saved on this device."))
        .catch(() =>
          setRecoveryStatus(
            "Conversion recovery is unavailable. Download your vectors before closing.",
          ),
        );
    }, 800);
    return () => clearTimeout(timer);
  }, [
    restored,
    file,
    namespace,
    vector,
    options,
    selected,
    split,
    stale,
    detail,
  ]);
  useEffect(() => {
    if (!file) return;
    const recovering = restoredFile.current === file;
    restoredFile.current = null;
    generation.current++;
    worker.current?.terminate();
    // A new external File cancels the worker and invalidates every old preview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(false);
    if (!recovering) {
      if (recoveryDraft.current)
        void writeConversion(recoveryDraft.current).catch(() => {});
      draftId.current = createId();
      setVector(null);
      setCorrections([]);
      assetId.current = createId();
    }
    setError("");
    if (!recovering) {
      setSelected([]);
      setStale(false);
      setSplit(true);
    }
    if (file.size > 32 * 1024 * 1024) {
      setError("Choose artwork under 32 MB.");
      return;
    }
    if (/\.svg$/i.test(file.name)) {
      setPreview("");
      if (recovering) return;
      const id = generation.current;
      file.text().then((source) => {
        if (id !== generation.current) return;
        try {
          const imported = importSVG(source, file.name);
          setVector(imported);
          setOptions((previous) => ({ ...previous, widthMM: imported.width }));
        } catch (e) {
          setError(errorMessage(e));
        }
      });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  const change = (partial: Partial<TraceOptions>) => {
    setOptions({ ...options, ...partial });
    if (partial.widthMM !== undefined && vector) {
      try {
        setVector(
          resizeProject(
            vector,
            partial.widthMM,
            (vector.height / vector.width) * partial.widthMM,
          ),
        );
        setError("");
      } catch (e) {
        setError(errorMessage(e));
      }
      return;
    }
    if (vector) setStale(true);
  };
  const prepared = useMemo(() => {
    if (!vector) return { elements: null, error: "" };
    try {
      const elements = {
        ...vector,
        objects: split
          ? vector.objects.flatMap(separateElements)
          : vector.objects,
      };
      assertGeometryBudget(elements.objects);
      return { elements, error: "" };
    } catch (e) {
      return { elements: null, error: errorMessage(e) };
    }
  }, [vector, split]);
  const elements = prepared.elements;
  function correct(changes: Partial<EmbroideryObject>) {
    if (!elements || !selected.length) return;
    setCorrections((previous) => [...previous.slice(-19), elements]);
    setVector({
      ...elements,
      objects: elements.objects.map((object) =>
        selected.includes(object.id) &&
        !object.locked &&
        (!changes.color || !object.colorLocked)
          ? {
              ...object,
              ...changes,
              ...(changes.color ? { thread: undefined } : {}),
            }
          : object,
      ),
    });
    setSplit(false);
  }
  const colors = useMemo(
    () => (elements ? analyzeColors(elements, null) : []),
    [elements],
  );
  async function trace() {
    if (!file || isSVG) return;
    if (
      corrections.length &&
      !window.confirm(
        "Retracing replaces your local vector corrections. Continue with the new trace settings?",
      )
    )
      return;
    const id = ++generation.current;
    worker.current?.terminate();
    setBusy(true);
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      if (id !== generation.current) {
        bitmap.close();
        return;
      }
      const ratio = Math.min(
          1,
          options.resolution / Math.max(bitmap.width, bitmap.height),
        ),
        width = Math.max(1, Math.round(bitmap.width * ratio)),
        height = Math.max(1, Math.round(bitmap.height * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const w = new Worker(
        new URL("../../lib/embroidery/trace-worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      const timeout = setTimeout(() => {
        w.terminate();
        if (id === generation.current) {
          setBusy(false);
          setError(
            "Tracing took too long. Try fewer colours or a lower resolution.",
          );
        }
      }, 25000);
      w.onmessage = (event) => {
        clearTimeout(timeout);
        w.terminate();
        if (id !== generation.current) return;
        setBusy(false);
        if (event.data.error) setError(event.data.error);
        else {
          setCorrections([]);
          setVector(event.data.project);
          setSelected([]);
          setStale(false);
        }
      };
      w.onerror = () => {
        clearTimeout(timeout);
        w.terminate();
        if (id === generation.current) {
          setBusy(false);
          setError(
            "The trace worker could not process this image. Try another image or lower detail.",
          );
        }
      };
      w.postMessage({ pixels, width, height, options, name: file.name }, [
        pixels.buffer,
      ]);
    } catch (e) {
      if (id === generation.current) {
        setBusy(false);
        setError(errorMessage(e));
      }
    }
  }
  async function apply() {
    if (!elements || !file || uploading) return;
    const id = generation.current;
    const sourceAssetId = assetId.current;
    setUploading(true);
    setError("");
    try {
      await rememberArtwork(namespace, sourceAssetId, file);
      const account = namespace.startsWith("account:");
      let cloudReady = false;
      if (account) {
        try {
          await uploadArtwork(file, sourceAssetId, namespace);
          cloudReady = true;
        } catch {
          if (id === generation.current)
            toast.warning(
              "Vectors are ready. The original is saved on this device; retry its cloud upload in Reference artwork.",
            );
        }
      }
      const artwork = {
        id: sourceAssetId,
        name: file.name,
        options: { ...options, widthMM: elements.width },
      };
      if (id === generation.current) {
        const next = { ...elements, units: measure.unit, artwork };
        onApply(
          isSVG
            ? next
            : attachSourceLayer(next, artwork.id, file.name, cloudReady),
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }
  return (
    <section className="feature-workspace conversion-workspace">
      <div className="feature-heading">
        <div>
          <span className="eyebrow">Artwork preparation</span>
          <h1>Convert your artwork.</h1>
          <p>Set the size, choose the detail and create editable vectors.</p>
        </div>
        <button
          className="button"
          disabled={!restored || uploading}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          Choose artwork
        </button>
      </div>
      <p className="help-text" role="status">
        {restored ? recoveryStatus : "Restoring conversion…"}
      </p>
      {original && (
        <button
          className="button"
          disabled={uploading}
          onClick={async () => {
            if (
              file &&
              !window.confirm(
                "Open this design's original artwork? Your current conversion is saved on this device.",
              )
            )
              return;
            setUploading(true);
            try {
              const sourceFile =
                (await cachedArtwork(namespace, original.id)) ??
                (namespace.startsWith("account:")
                  ? await openArtwork(original.id)
                  : null);
              if (!sourceFile)
                throw new Error(
                  "Reattach the original artwork to reopen this conversion on this device.",
                );
              if (recoveryDraft.current)
                await writeConversion(recoveryDraft.current);
              restoredFile.current = sourceFile;
              draftId.current = createId();
              assetId.current = original.id;
              setFile(sourceFile);
              setVector(originalProject ?? null);
              setCorrections([]);
              setSplit(false);
              setStale(false);
              setSelected([]);
              setOptions({
                ...options,
                ...original.options,
                widthMM: originalProject?.width ?? options.widthMM,
              });
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setUploading(false);
            }
          }}
        >
          Open original · {original.name}
        </button>
      )}
      <input
        className="sr-only"
        type="file"
        ref={input}
        accept=".svg,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const next = e.target.files?.[0];
          if (next) setFile(next);
          e.target.value = "";
        }}
      />
      <div className="conversion-layout">
        <aside className="feature-card conversion-settings">
          <h2>
            <ScanLine size={17} />
            Artwork settings
          </h2>
          <NumberField
            label="Artwork width"
            max={null}
            value={vector?.width ?? options.widthMM}
            onChange={(widthMM) => change({ widthMM })}
            disabled={busy}
          />
          {vector && (
            <p className="help-text">
              {measure.size(vector.width, vector.height)} · proportions
              preserved
            </p>
          )}
          <Range
            label="Colour count"
            value={options.colors}
            min={2}
            max={options.mode === "centerline" ? 8 : 64}
            onChange={(colors) => change({ colors })}
            disabled={isSVG || busy}
          />
          <Choice
            label="Conversion detail"
            value={detail}
            disabled={isSVG || busy}
            onChange={(value) => {
              setDetail(value);
              change({
                resolution:
                  options.mode === "centerline"
                    ? 768
                    : value === "intricate"
                      ? 1536
                      : value === "clean"
                        ? 768
                        : 1024,
                minArea: value === "clean" ? 4 : 0,
                simplifyMM: value === "intricate" ? 0.02 : 0.06,
                preservePixels: true,
                preserveHoles: true,
                smoothCurves: true,
                islandAction: "merge",
              });
            }}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "intricate", label: "Intricate · preserve fine detail" },
              { value: "clean", label: "Clean · merge small specks" },
            ]}
          />
          <label className="toggle-row">
            Remove border-connected white background
            <Switch
              checked={options.removeWhite}
              onCheckedChange={(removeWhite) => change({ removeWhite })}
              disabled={isSVG || busy}
            />
          </label>
          <details className="conversion-advanced">
            <summary>Advanced tracing options</summary>
            <Choice
              label="White background treatment"
              value={options.backgroundMode ?? "border"}
              disabled={isSVG || busy || !options.removeWhite}
              onChange={(backgroundMode) =>
                change({
                  backgroundMode:
                    backgroundMode as TraceOptions["backgroundMode"],
                })
              }
              options={[
                { value: "border", label: "Keep interior whites" },
                { value: "all-white", label: "Remove all near-white pixels" },
              ]}
            />
            <div className="field">
              <span className="small-label">Trace method</span>
              <Choice
                label="Trace method"
                value={options.mode ?? "regions"}
                disabled={isSVG || busy}
                onChange={(v) =>
                  change({
                    mode: v as TraceOptions["mode"],
                    ...(v === "centerline"
                      ? {
                          colors: Math.min(8, options.colors),
                          resolution: Math.min(768, options.resolution),
                        }
                      : {}),
                  })
                }
                options={[
                  { value: "regions", label: "Filled colour regions" },
                  { value: "centerline", label: "Line art · centreline runs" },
                ]}
              />
            </div>
            <div className="field">
              <span className="small-label">
                Trace resolution · longest edge
              </span>
              <Choice
                label="Trace resolution"
                value={String(options.resolution)}
                onChange={(v) => change({ resolution: Number(v) })}
                disabled={isSVG || busy}
                options={(options.mode === "centerline"
                  ? [256, 384, 512, 768]
                  : [256, 512, 768, 1024, 1536, 2048]
                ).map((n) => ({ value: String(n), label: `${n} pixels` }))}
              />
            </div>
            <Choice
              label="Small speck treatment"
              value={options.islandAction ?? "discard"}
              disabled={isSVG || busy}
              onChange={(v) =>
                change({ islandAction: v as "discard" | "merge" })
              }
              options={[
                { value: "merge", label: "Merge low-contrast touching specks" },
                { value: "discard", label: "Discard small colour islands" },
              ]}
            />
            <Range
              label="Speck area threshold"
              value={options.minArea}
              min={0}
              max={30}
              unit=" px²"
              onChange={(minArea) => change({ minArea })}
              disabled={isSVG || busy}
            />
            <label className="toggle-row">
              Preserve interior holes
              <Switch
                checked={options.preserveHoles !== false}
                onCheckedChange={(preserveHoles) => change({ preserveHoles })}
                disabled={isSVG || busy}
              />
            </label>
            <Range
              label="Contour tolerance"
              value={options.simplifyMM ?? 0.06}
              min={0}
              max={0.5}
              step={0.01}
              unit=" mm"
              onChange={(simplifyMM) => change({ simplifyMM })}
              disabled={isSVG || busy}
            />
            <label
              className="toggle-row"
              title="Reject refined contours when they change the source pixel mask."
            >
              Protect pixel-sized details
              <Switch
                checked={options.preservePixels !== false}
                disabled={isSVG || busy}
                onCheckedChange={(preservePixels) => change({ preservePixels })}
              />
            </label>
            <label
              className="toggle-row"
              title="Round shallow bends within the contour tolerance; keep sharp corners."
            >
              Refine smooth boundaries
              <Switch
                checked={!!options.smoothCurves}
                disabled={isSVG || busy}
                onCheckedChange={(smoothCurves) => change({ smoothCurves })}
              />
            </label>
            <details>
              <summary>Exact colours & pixel thresholds</summary>
              <label className="small-label">
                Exact palette · hex values
                <textarea
                  className="text-input"
                  rows={3}
                  placeholder="#21776A, #C79647, #FFFFFF"
                  disabled={isSVG || busy}
                  value={options.palette?.join(", ") ?? ""}
                  onChange={(e) =>
                    change({
                      palette: e.target.value.trim()
                        ? e.target.value.split(/[,\s]+/).filter(Boolean)
                        : undefined,
                    })
                  }
                />
              </label>
              <p className="help-text">
                Supply your own palette to keep those exact hex values. Empty
                uses perceptual colour reduction. Trace resolution limits the
                detail that can be recovered.
              </p>
              <Range
                label="Opacity threshold"
                value={options.alphaThreshold ?? 128}
                min={1}
                max={255}
                onChange={(alphaThreshold) => change({ alphaThreshold })}
                disabled={isSVG || busy}
              />
              <Range
                label="Near-white threshold"
                value={options.whiteThreshold ?? 244}
                min={200}
                max={255}
                onChange={(whiteThreshold) => change({ whiteThreshold })}
                disabled={isSVG || busy}
              />
            </details>
          </details>
          <button
            className="button primary full"
            disabled={
              !file ||
              isSVG ||
              busy ||
              uploading ||
              file.size > 32 * 1024 * 1024
            }
            onClick={() => void trace()}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ScanLine size={16} />
            )}{" "}
            {busy
              ? "Tracing contours…"
              : vector
                ? "Retrace artwork"
                : "Convert to vector"}
          </button>
          <label className="toggle-row">
            Separate connected elements
            <Switch checked={split} onCheckedChange={setSplit} />
          </label>
          <p className="help-text">
            Holes stay attached to their surrounding element. SVG dimensions and
            paths are preserved on import.
          </p>
        </aside>
        <div className="conversion-main">
          <div className="comparison-grid">
            <div className="preview-card">
              <div className="preview-title">
                Original artwork<span>{file?.name ?? "No file selected"}</span>
              </div>
              <div className="preview-stage">
                {preview ? (
                  <img src={preview} alt="Original bitmap artwork" />
                ) : isSVG && vector ? (
                  <VectorPreview project={vector} />
                ) : (
                  <button
                    className="empty-art"
                    onClick={() => input.current?.click()}
                  >
                    <FileImage size={38} strokeWidth={1} />
                    <strong>Bring your artwork in</strong>
                    <span>SVG · PNG · JPG · WebP</span>
                  </button>
                )}
              </div>
            </div>
            <div className="preview-card">
              <div className="preview-title">
                Editable vectors
                <span>
                  {elements
                    ? `${elements.objects.length} elements`
                    : "Ready to trace"}
                </span>
              </div>
              <div className="preview-stage">
                {elements ? (
                  <VectorPreview
                    project={elements}
                    selected={selected}
                    onSelect={(id) =>
                      setSelected(selected.includes(id) ? [] : [id])
                    }
                  />
                ) : (
                  <div className="empty-art">
                    <Layers3 size={38} strokeWidth={1} />
                    <strong>Every shape, independently editable</strong>
                    <span>Trace your image to inspect its contours.</span>
                  </div>
                )}
                {busy && (
                  <div className="busy-overlay">
                    <div>
                      <Loader2 className="animate-spin" />
                      Tracing artwork
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {elements && preview && (
            <TraceComparison project={elements} image={preview} />
          )}
          {(error || prepared.error) && (
            <div className="issue error" role="alert">
              {error || prepared.error}
            </div>
          )}
          {stale && (
            <div className="issue">
              Settings changed. Retrace to apply them to this preview.
            </div>
          )}
          {elements && (
            <div className="feature-card">
              <div className="row between">
                <h2>
                  <Palette size={17} />
                  Colour & element breakdown
                </h2>
                <button className="text-button" onClick={() => setSelected([])}>
                  Show all
                </button>
              </div>
              <div className="colour-breakdown">
                {colors.map((c) => (
                  <button
                    key={c.color}
                    className={`colour-summary ${selected.some((id) => c.objectIds.includes(id)) ? "active" : ""}`}
                    onClick={() => setSelected(c.objectIds)}
                  >
                    <span
                      className="large-swatch"
                      style={{ background: c.color }}
                    />
                    <span>
                      <strong>{c.color.toUpperCase()}</strong>
                      <small>
                        {c.objectIds.length} element
                        {c.objectIds.length === 1 ? "" : "s"} · ≈{" "}
                        {measure.area(c.areaMM2)}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="region-corrections">
                <strong>
                  {selected.length
                    ? `${selected.length} selected regions`
                    : "Select a region in the preview, or select a colour above"}
                </strong>
                <div className="row">
                  <Choice
                    label="Selected region role"
                    value="choose"
                    disabled={!selected.length || stale}
                    onChange={(role) => {
                      if (role !== "choose")
                        correct({
                          artworkRole: role as EmbroideryObject["artworkRole"],
                        });
                    }}
                    options={[
                      { value: "choose", label: "Assign role…" },
                      { value: "embroidery", label: "Embroider" },
                      { value: "print", label: "Printed artwork" },
                      { value: "fabric", label: "Exposed fabric" },
                      { value: "reference", label: "Reference only" },
                    ]}
                  />
                  <label className="row">
                    Exact colour
                    <input
                      type="color"
                      aria-label="Region correction colour"
                      value={correctionColor}
                      onChange={(e) => setCorrectionColor(e.target.value)}
                    />
                  </label>
                  <button
                    className="button"
                    disabled={!selected.length || stale}
                    onClick={() => correct({ color: correctionColor })}
                  >
                    Apply / merge colour
                  </button>
                  <button
                    className="button"
                    disabled={!selected.length || stale}
                    onClick={() => correct({ colorLocked: true })}
                  >
                    Protect exact colour
                  </button>
                  <button
                    className="button"
                    disabled={!corrections.length}
                    onClick={() => {
                      setVector(corrections.at(-1)!);
                      setCorrections((c) => c.slice(0, -1));
                      setSplit(false);
                    }}
                  >
                    Undo correction
                  </button>
                </div>
                <p className="help-text">
                  Corrections keep each contour editable. Protected colours stay
                  unchanged when merging; assign exposed fabric to an
                  intentional opening.
                </p>
              </div>
              <div className="conversion-summary">
                <span>
                  {measure.size(elements.width, elements.height)}·{" "}
                  {elements.objects
                    .reduce(
                      (n, o) => n + o.paths.reduce((s, p) => s + p.length, 0),
                      0,
                    )
                    .toLocaleString()}{" "}
                  vector points
                </span>
                <div className="row">
                  <button
                    className="button"
                    disabled={stale}
                    onClick={() =>
                      download(
                        exportSVG(elements),
                        fileName(elements.name) + ".svg",
                        "image/svg+xml",
                      )
                    }
                  >
                    <Download size={15} />
                    SVG
                  </button>
                  <button
                    className="button primary"
                    disabled={stale || busy || uploading || !restored}
                    onClick={() => void apply()}
                  >
                    {uploading ? "Saving original…" : "Use in studio"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              <details>
                <summary>Conversion details</summary>
                {elements.notes.map((note, i) => (
                  <p className="help-text" key={i}>
                    {note}
                  </p>
                ))}
              </details>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
