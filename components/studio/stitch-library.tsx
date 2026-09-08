"use client";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  STITCH_NAMES,
  LINE_TYPES,
  makeObject,
  type Project,
  type StitchType,
} from "@/lib/embroidery/types";
import { useStitchPlan } from "@/hooks/use-stitch-plan";
import { PlanPreview } from "./plan-preview";
const groups: { name: string; types: StitchType[] }[] = [
  {
    name: "Runs & borders",
    types: [
      "run",
      "double",
      "triple",
      "back",
      "stem",
      "zigzag",
      "blanket",
      "chain",
      "candlewick",
      "coil-run",
      "motif-run",
      "manual",
    ],
  },
  {
    name: "Satin & solid fills",
    types: [
      "satin",
      "raised-satin",
      "satin-column",
      "column-c",
      "tatami",
      "program-split",
      "contour",
    ],
  },
  {
    name: "Decorative fills",
    types: [
      "wave",
      "cross",
      "half-cross",
      "quarter-cross",
      "petite-cross",
      "island-coil",
      "square-fill",
      "double-square",
      "motif",
      "spiral",
      "ripple",
      "meander",
      "coil-fill",
    ],
  },
];
export default function StitchLibrary({
  open,
  onOpenChange,
  onApply,
  hasSelection,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (type: StitchType) => void;
  hasSelection: boolean;
}) {
  const [type, setType] = useState<StitchType>("tatami"),
    [query, setQuery] = useState("");
  const sample = useMemo<Project>(
    () => ({
      version: 1,
      name: STITCH_NAMES[type],
      width: 50,
      height: 40,
      fabric: "linen",
      workspaceMode: "freeform",
      hoopWidth: 50,
      hoopHeight: 40,
      source: "manual",
      notes: [],
      objects: [
        makeObject({
          id: "preview",
          name: STITCH_NAMES[type],
          type,
          color: "#267969",
          paths:
            type === "satin-column"
              ? [
                  [
                    { x: 12, y: 6 },
                    { x: 18, y: 19 },
                    { x: 11, y: 33 },
                  ],
                  [
                    { x: 17, y: 6 },
                    { x: 24, y: 19 },
                    { x: 16, y: 33 },
                  ],
                ]
              : LINE_TYPES.includes(type)
                ? [
                    [
                      { x: 7, y: 25 },
                      { x: 15, y: 13 },
                      { x: 29, y: 12 },
                      { x: 42, y: 26 },
                    ],
                  ]
                : [
                    [
                      { x: 8, y: 7 },
                      { x: 42, y: 7 },
                      { x: 42, y: 33 },
                      { x: 8, y: 33 },
                    ],
                  ],
          closed:
            type === "satin-column"
              ? [false, false]
              : [!LINE_TYPES.includes(type)],
          underlay:
            !LINE_TYPES.includes(type) &&
            !type.includes("cross") &&
            type !== "raised-satin",
          spacing: type === "spiral" || type === "ripple" ? 0.8 : 0.45,
          pull: 0,
          patternSize: 5,
        }),
      ],
    }),
    [type],
  );
  const { plan, busy, error } = useStitchPlan(sample);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="stitch-library-dialog">
        <DialogHeader>
          <DialogTitle>Stitch methods & effects</DialogTitle>
          <DialogDescription>
            32 generated stitch methods. Preview real needle paths, then apply a
            method to your selected objects.
          </DialogDescription>
        </DialogHeader>
        <div className="stitch-library-layout">
          <div>
            <input
              className="text-input"
              placeholder="Find a stitch method"
              aria-label="Find a stitch method"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="method-list">
              {groups.map((group) => (
                <section key={group.name}>
                  <h3>{group.name}</h3>
                  {group.types
                    .filter((t) =>
                      STITCH_NAMES[t]
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((t) => (
                      <button
                        key={t}
                        className={`method-button ${t === type ? "active" : ""}`}
                        onClick={() => setType(t)}
                      >
                        {STITCH_NAMES[t]}
                      </button>
                    ))}
                </section>
              ))}
            </div>
          </div>
          <div>
            <PlanPreview
              view="stitches"
              project={sample}
              plan={plan}
              label={STITCH_NAMES[type]}
            />
            <p className="help-text">
              {busy
                ? "Generating sample…"
                : (error ??
                  `${plan?.stitchCount.toLocaleString() ?? 0} sample stitches · actual generated paths`)}
            </p>
            {type === "raised-satin" && (
              <p className="help-text">
                Three satin layers add body. Keep spans within your machine’s
                satin width, inspect the density, and sew a sample on the
                intended fabric.
              </p>
            )}
            <p className="help-text">
              Column A and B use paired edges; draw these with their dedicated
              tools. Column C follows a centreline. Decorative chain, knot and
              coil effects use ordinary lockstitch paths. Chenille, sequins,
              cording and loop cutting require hardware-specific controls.
            </p>
            <button
              className="button primary full"
              disabled={!hasSelection || type === "satin-column"}
              onClick={() => {
                onApply(type);
                onOpenChange(false);
              }}
            >
              Apply to selection
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
