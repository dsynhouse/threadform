"use client";
import { useRef, useState } from "react";
import { outlinePaths } from "@/lib/embroidery/operations";
import { LINE_TYPES, type Project } from "@/lib/embroidery/types";
import { Choice, Range } from "./controls";
export default function TraceComparison({
  project,
  image,
}: {
  project: Project;
  image: string;
}) {
  const [mode, setMode] = useState("overlay"),
    [zoom, setZoom] = useState(1),
    [opacity, setOpacity] = useState(0.55),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; pan: typeof pan } | null>(null);
  const w = project.width / zoom,
    h = project.height / zoom,
    x = (project.width - w) / 2 + pan.x,
    y = (project.height - h) / 2 + pan.y;
  return (
    <div className="feature-card trace-detail">
      <div className="row between">
        <h2>Inspect fine detail</h2>
        <button
          className="text-button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </button>
      </div>
      <div className="trace-detail-controls">
        <Choice
          label="Detail comparison"
          value={mode}
          onChange={setMode}
          options={[
            { value: "overlay", label: "Bitmap + vector overlay" },
            { value: "bitmap", label: "Original bitmap" },
            { value: "vector", label: "Vector only" },
          ]}
        />
        <Range
          label="Detail zoom"
          value={zoom}
          min={1}
          max={8}
          step={0.25}
          unit="×"
          onChange={setZoom}
        />
        <Range
          label="Vector overlay opacity"
          value={opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={setOpacity}
          disabled={mode !== "overlay"}
        />
      </div>
      <svg
        className="trace-detail-svg"
        role="img"
        aria-label="Zoomable bitmap and vector comparison"
        viewBox={`${x} ${y} ${w} ${h}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, pan };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(r.width / w, r.height / h);
          setPan({
            x: drag.current.pan.x - (e.clientX - drag.current.x) / scale,
            y: drag.current.pan.y - (e.clientY - drag.current.y) / scale,
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <rect width={project.width} height={project.height} fill="white" />
        {mode !== "vector" && (
          <image
            href={image}
            x="0"
            y="0"
            width={project.width}
            height={project.height}
            preserveAspectRatio="none"
          />
        )}
        {mode !== "bitmap" && (
          <g opacity={mode === "overlay" ? opacity : 1}>
            {project.objects
              .filter((o) => o.visible)
              .map((o) => (
                <path
                  key={o.id}
                  d={outlinePaths(o)
                    .map(
                      (p, i) =>
                        p
                          .map((v, j) => `${j ? "L" : "M"}${v.x} ${v.y}`)
                          .join(" ") + (o.closed[i] ? "Z" : ""),
                    )
                    .join(" ")}
                  fill={LINE_TYPES.includes(o.type) ? "none" : o.color}
                  fillRule={o.fillRule}
                  stroke={
                    LINE_TYPES.includes(o.type)
                      ? o.color
                      : mode === "overlay"
                        ? "#f00073"
                        : "none"
                  }
                  strokeWidth={
                    mode === "overlay"
                      ? Math.max(0.015, project.width / 2000)
                      : 0.3
                  }
                />
              ))}
          </g>
        )}
      </svg>
      <p className="help-text">
        Drag to pan. Pink boundaries expose edge alignment; switch between
        bitmap and vector to inspect holes, fine lines and small colour regions.
        Preview is at the trace resolution.
      </p>
    </div>
  );
}
