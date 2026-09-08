"use client";
import { useState } from "react";
import type { Project } from "@/lib/embroidery/types";
import { Switch } from "@/components/ui/switch";
import { Choice } from "./controls";
export default function MachineProgram({
  project,
  onChange,
}: {
  project: Project;
  onChange: (p: Project) => void;
}) {
  const [id, setId] = useState(project.objects[0]?.id ?? "");
  const object = project.objects.find((o) => o.id === id),
    m = project.machine ?? {
      name: "Custom machine",
      fieldWidth: project.hoopWidth,
      fieldHeight: project.hoopHeight,
      fieldCheck: true,
      maxStitches: 350000,
      maxColors: 255,
    };
  const update = (values: Partial<NonNullable<typeof object>>) => {
    if (object && !object.locked)
      onChange({
        ...project,
        objects: project.objects.map((o) =>
          o.id === id ? { ...o, ...values } : o,
        ),
      });
  };
  return (
    <div className="feature-card">
      <h2>Machine commands</h2>
      <div className="two-fields">
        <label className="form-field">
          Hardware profile
          <Choice
            label="Specialty hardware profile"
            value={m.specialty ?? "lockstitch"}
            options={[
              { value: "lockstitch", label: "Standard lockstitch" },
              {
                value: "tajima-single-sequin",
                label: "Tajima-compatible single sequin · DST",
              },
            ]}
            onChange={(v) =>
              onChange({
                ...project,
                machine: {
                  ...m,
                  specialty: v as "lockstitch" | "tajima-single-sequin",
                },
              })
            }
          />
        </label>
        <label className="form-field">
          Sewing object
          <Choice
            label="Machine command object"
            value={id}
            onChange={setId}
            options={project.objects
              .filter((o) => o.type !== "none")
              .map((o) => ({ value: o.id, label: o.name }))}
          />
        </label>
      </div>
      {object && (
        <>
          <label className="toggle-row">
            Pause after this object
            <Switch
              checked={!!object.pauseAfter}
              disabled={object.locked}
              onCheckedChange={(v) => update({ pauseAfter: v })}
            />
          </label>
          <label className="toggle-row">
            Each manual point drops one sequin
            <Switch
              checked={!!object.sequinMode}
              disabled={object.locked || object.type !== "manual"}
              onCheckedChange={(v) =>
                update({
                  sequinMode: v,
                  ...(v
                    ? { underlay: false, tieIn: false, tieOut: false }
                    : {}),
                })
              }
            />
          </label>
        </>
      )}
      <p className="help-text">
        Use pauses for appliqué placement and operator checks. DST/EXP encode
        these as colour stops; configure the controller to hold the same thread.
        Sequin drops require a manual needle-point object and a compatible
        single-sequin device. Other formats reject sequin output. Loop height,
        chain/moss, cording, bead and laser commands are not encoded.
      </p>
    </div>
  );
}
