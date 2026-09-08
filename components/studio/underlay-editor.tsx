"use client";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { createId } from "@/lib/embroidery/id";
import {
  objectUnderlays,
  underlayLayer,
  UNDERLAY_METHODS,
} from "@/lib/embroidery/underlay-settings";
import type { EmbroideryObject, UnderlayLayer } from "@/lib/embroidery/types";
import { Choice, NumberField } from "./controls";

export function UnderlayEditor({
  object,
  update,
  disabled,
}: {
  object: EmbroideryObject;
  update: (changes: Partial<EmbroideryObject>) => void;
  disabled: boolean;
}) {
  const layers = objectUnderlays(object);
  const change = (index: number, changes: Partial<UnderlayLayer>) =>
    update({
      underlays: layers.map((l, i) => (i === index ? { ...l, ...changes } : l)),
    });
  const move = (index: number, delta: number) => {
    const next = [...layers];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    update({ underlays: next });
  };
  return (
    <div className="underlay-editor">
      <p className="help-text">
        Underlays sew in this order, followed by the cover. Each pass keeps its
        own spacing, length and inset.
      </p>
      {layers.map((layer, index) => (
        <fieldset className="underlay-layer" key={layer.id} disabled={disabled}>
          <legend>
            {index === 0
              ? "First underlay"
              : index === 1
                ? "Second underlay"
                : `Underlay ${index + 1}`}
          </legend>
          <div className="row between">
            <label className="toggle-row">
              Enabled
              <Switch
                checked={layer.enabled}
                disabled={disabled}
                onCheckedChange={(enabled) => change(index, { enabled })}
              />
            </label>
            <div className="row">
              <button
                type="button"
                className="icon-button"
                aria-label={`Move underlay ${index + 1} earlier`}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move underlay ${index + 1} later`}
                disabled={disabled || index === layers.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove underlay ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  update({ underlays: layers.filter((_, i) => i !== index) })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <Choice
            label="Underlay type"
            value={layer.kind}
            options={[...UNDERLAY_METHODS]}
            disabled={disabled || !layer.enabled}
            onChange={(kind) =>
              change(index, {
                ...underlayLayer(kind as UnderlayLayer["kind"], layer.id),
                inset: layer.inset,
              })
            }
          />
          <div className="two-fields">
            <NumberField
              label="Underlay stitch length"
              value={layer.length}
              min={0.1}
              max={12}
              disabled={disabled || !layer.enabled}
              onChange={(length) => change(index, { length })}
            />
            <NumberField
              label="Underlay inset"
              value={layer.inset}
              min={0}
              max={100}
              disabled={disabled || !layer.enabled}
              onChange={(inset) => change(index, { inset })}
            />
            {!["center", "edge"].includes(layer.kind) && (
              <NumberField
                label="Underlay spacing"
                value={layer.spacing}
                min={0.1}
                max={50}
                disabled={disabled || !layer.enabled}
                onChange={(spacing) => change(index, { spacing })}
              />
            )}
            {layer.kind === "tatami" && (
              <NumberField
                label="Relative underlay angle"
                value={layer.angle}
                min={-360}
                max={360}
                unit="°"
                disabled={disabled || !layer.enabled}
                onChange={(angle) => change(index, { angle })}
              />
            )}
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="button"
        disabled={disabled}
        onClick={() =>
          update({
            underlays: [
              ...layers,
              underlayLayer(
                ["satin-column", "column-c"].includes(object.type)
                  ? "zigzag"
                  : "tatami",
                createId(),
              ),
            ],
          })
        }
      >
        <Plus size={14} /> Add underlay
      </button>
    </div>
  );
}
