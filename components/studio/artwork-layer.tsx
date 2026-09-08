"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Eye,
  EyeOff,
  LockKeyhole,
  UnlockKeyhole,
  Sun,
  SunDim,
} from "lucide-react";
import { toast } from "sonner";
import type { ArtworkLayer, Project } from "@/lib/embroidery/types";
import {
  artworkDimensions,
  createArtworkLayer,
  positionArtwork,
} from "@/lib/embroidery/artwork-layer";
import { createId } from "@/lib/embroidery/id";
import { cachedArtwork, rememberArtwork } from "@/lib/client/recovery";
import { uploadArtwork, openArtwork } from "@/lib/client/artwork-storage";
import {
  IconButton,
  NumberField,
  Range,
  download,
  errorMessage,
} from "./controls";

async function imageSize(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image(),
        timeout = setTimeout(
          () => reject(new Error("Artwork decoding timed out.")),
          15000,
        );
      img.onload = () => {
        clearTimeout(timeout);
        if (img.naturalWidth && img.naturalHeight)
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        else reject(new Error("The image has no dimensions."));
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Choose a readable PNG, JPEG, WebP or SVG image."));
      };
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export default function ArtworkLayerControls({
  project,
  namespace,
  onChange,
}: {
  project: Project;
  namespace: string;
  onChange: (
    update: (layer: ArtworkLayer | undefined) => ArtworkLayer | undefined,
  ) => void;
}) {
  const layer = project.artworkLayer,
    input = useRef<HTMLInputElement>(null),
    alive = useRef(true);
  const latest = useRef({ project, onChange });
  useLayoutEffect(() => {
    latest.current = { project, onChange };
  }, [project, onChange]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const patch = (changes: Partial<ArtworkLayer>) =>
    onChange((current) => (current ? { ...current, ...changes } : current));
  const dimensions = layer ? artworkDimensions(layer) : null;
  async function sync(file: File, id: string) {
    if (!namespace.startsWith("account:")) return;
    try {
      await uploadArtwork(file, id, namespace);
      if (alive.current) {
        latest.current.onChange((current) =>
          current?.assetId === id ? { ...current, cloudReady: true } : current,
        );
        setStatus("Original artwork saved to your account.");
      }
    } catch (e) {
      if (alive.current)
        setStatus(
          "Saved on this device. Cloud upload needs retry: " + errorMessage(e),
        );
    }
  }
  async function insert(file: File) {
    setBusy(true);
    setStatus("");
    try {
      const image = await imageSize(file),
        id = createId();
      await rememberArtwork(namespace, id, file);
      if (!alive.current) return;
      const p = latest.current.project,
        scale = Math.min(p.width / image.width, p.height / image.height);
      const next = p.artworkLayer
        ? { ...p.artworkLayer, assetId: id, name: file.name, cloudReady: false }
        : createArtworkLayer(
            id,
            file.name,
            image.width * scale,
            image.height * scale,
          );
      if (!p.artworkLayer) {
        next.transform[4] = (p.width - image.width * scale) / 2;
        next.transform[5] = (p.height - image.height * scale) / 2;
      }
      latest.current.onChange(() => next);
      setStatus("Original artwork saved on this device.");
      await sync(file, id);
    } catch (e) {
      if (alive.current) toast.error(errorMessage(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <details className="artwork-layer-panel">
      <summary>
        <ImagePlus size={15} />
        <span>Reference artwork</span>
        {layer && <span className="badge">1</span>}
      </summary>
      <div className="artwork-layer-content">
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept=".png,.jpg,.jpeg,.webp,.svg"
          aria-label="Insert reference artwork"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void insert(file);
          }}
        />
        <button
          className="button small"
          disabled={busy || !namespace}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={14} />
          {busy
            ? "Saving artwork…"
            : layer
              ? "Replace reference"
              : "Insert reference"}
        </button>
        {!layer && (
          <p className="help-text">
            Place an image behind the stitches to trace by hand. Conversion is
            optional.
          </p>
        )}
        {layer && dimensions && (
          <>
            <strong className="artwork-layer-name" title={layer.name}>
              {layer.name}
            </strong>
            <div className="row">
              <IconButton
                label={
                  layer.visible
                    ? "Hide reference artwork"
                    : "Show reference artwork"
                }
                active={layer.visible}
                onClick={() => patch({ visible: !layer.visible })}
              >
                {layer.visible ? <Eye /> : <EyeOff />}
              </IconButton>
              <IconButton
                label={
                  layer.dimmed
                    ? "Undim reference artwork"
                    : "Dim reference artwork"
                }
                active={layer.dimmed}
                onClick={() => patch({ dimmed: !layer.dimmed })}
              >
                {layer.dimmed ? <SunDim /> : <Sun />}
              </IconButton>
              <IconButton
                label={
                  layer.locked
                    ? "Unlock artwork position"
                    : "Lock artwork position"
                }
                active={layer.locked}
                onClick={() => patch({ locked: !layer.locked })}
              >
                {layer.locked ? <LockKeyhole /> : <UnlockKeyhole />}
              </IconButton>
            </div>
            <Range
              label="Dimmed opacity"
              value={layer.opacity * 100}
              min={0}
              max={100}
              unit="%"
              disabled={!layer.dimmed}
              onChange={(value) => patch({ opacity: value / 100 })}
            />
            <div className="artwork-transform-grid">
              {(["x", "y", "width", "height", "rotation"] as const).map(
                (key) => (
                  <NumberField
                    key={key}
                    label={`Artwork ${key}`}
                    value={dimensions[key]}
                    min={key === "width" || key === "height" ? 0.01 : null}
                    max={null}
                    unit={key === "rotation" ? "°" : "mm"}
                    disabled={layer.locked}
                    onChange={(n) => {
                      try {
                        onChange((current) =>
                          current
                            ? positionArtwork(current, { [key]: n })
                            : current,
                        );
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  />
                ),
              )}
            </div>
            <p className="help-text">
              {layer.locked
                ? "Position locked. Unlock to move, resize or rotate."
                : "Position in design coordinates. Changes can be undone."}
            </p>
            <div className="artwork-layer-actions">
              {!layer.cloudReady && namespace.startsWith("account:") && (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const file = await cachedArtwork(
                        namespace,
                        layer.assetId,
                      );
                      if (!file)
                        throw new Error(
                          "Reattach the original image to upload it.",
                        );
                      await sync(file, layer.assetId);
                    } catch (e) {
                      setStatus(errorMessage(e));
                    } finally {
                      if (alive.current) setBusy(false);
                    }
                  }}
                >
                  Retry cloud upload
                </button>
              )}
              <button
                className="button small"
                disabled={busy}
                onClick={async () => {
                  try {
                    const file =
                      (await cachedArtwork(namespace, layer.assetId)) ??
                      (namespace.startsWith("account:")
                        ? await openArtwork(layer.assetId)
                        : null);
                    if (!file)
                      throw new Error(
                        "Original artwork is unavailable. Reattach the image.",
                      );
                    download(
                      new Uint8Array(await file.arrayBuffer()),
                      file.name,
                      file.type,
                    );
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                Download original
              </button>
              <button
                className="button small"
                disabled={busy}
                onClick={() => onChange(() => undefined)}
              >
                Remove reference
              </button>
            </div>
            <p className="help-text">
              {layer.cloudReady
                ? "Original available in your account."
                : "Original stored on this device. Keep a copy for transfer."}
            </p>
          </>
        )}
        {status && (
          <p className="help-text" role="status">
            {status}
          </p>
        )}
      </div>
    </details>
  );
}
