"use client";
import { useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import EmbroideryCanvas, { type CanvasView } from "../embroidery-canvas";
import type { Project, StitchPlan } from "@/lib/embroidery/types";
import { IconButton } from "./controls";

const noop = () => {};
export function PlanPreview({
  project,
  plan,
  view,
  label,
}: {
  project: Project;
  plan: StitchPlan | null;
  view: CanvasView;
  label: string;
}) {
  const [zoom, setZoom] = useState(1),
    [reset, setReset] = useState(0);
  return (
    <div className="plan-preview">
      <div className="preview-label">
        <strong>{label}</strong>
        <div className="row">
          <IconButton
            label={`Zoom out ${label}`}
            onClick={() => setZoom((z) => Math.max(0.35, z / 1.25))}
          >
            <ZoomOut />
          </IconButton>
          <IconButton
            label={`Zoom in ${label}`}
            onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
          >
            <ZoomIn />
          </IconButton>
          <IconButton
            label={`Fit ${label}`}
            onClick={() => {
              setZoom(1);
              setReset((n) => n + 1);
            }}
          >
            <Maximize2 />
          </IconButton>
        </div>
      </div>
      <div className="plan-preview-canvas">
        <EmbroideryCanvas
          project={project}
          plan={plan}
          selected={[]}
          view={view}
          tool="hand"
          zoom={zoom}
          grid={false}
          snap={false}
          jumps={true}
          progress={100}
          reset={reset}
          onSelect={noop}
          onChange={noop}
          onAdd={noop}
          onHole={noop}
          onAngle={noop}
          onColor={noop}
          onZoom={setZoom}
        />
      </div>
    </div>
  );
}
