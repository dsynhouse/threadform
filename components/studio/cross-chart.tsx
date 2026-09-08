"use client";
import { createId } from "@/lib/embroidery/id";
import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { inside } from "@/lib/embroidery/geometry";
import { outlinePaths } from "@/lib/embroidery/operations";
import {
  makeObject,
  STITCH_NAMES,
  type Project,
  type StitchType,
  type EmbroideryObject,
} from "@/lib/embroidery/types";
import { Choice, NumberField } from "./controls";
type Cell = { color: string; type: StitchType } | null;
const SIDE = 24;
import { useMeasurements } from "./measurement-units";
export default function CrossChart({
  open,
  onOpenChange,
  project,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  onAdd: (objects: EmbroideryObject[]) => void;
}) {
  const measure = useMeasurements();
  const [cells, setCells] = useState<Cell[]>(() =>
      Array(SIDE * SIDE).fill(null),
    ),
    [history, setHistory] = useState<Cell[][]>([]);
  const [size, setSize] = useState(1.8),
    [color, setColor] = useState("#21776a"),
    [type, setType] = useState<StitchType>("cross"),
    [erase, setErase] = useState(false),
    [order, setOrder] = useState("danish");
  const helpId = useId();
  const [cursor, setCursor] = useState({ x: 0, y: 0 }),
    [focused, setFocused] = useState(false);
  const palette = [
    ...new Set([
      "#21776a",
      "#c79647",
      "#20324c",
      "#d66d73",
      "#ffffff",
      ...project.objects.map((o) => o.color),
    ]),
  ].slice(0, 32);
  const origin = {
    x: Math.floor((project.width - SIDE * size) / 2 / size) * size,
    y: Math.floor((project.height - SIDE * size) / 2 / size) * size,
  };
  const remember = () => setHistory((h) => [...h.slice(-19), cells]);
  function paintCell(x: number, y: number, erasing = erase) {
    if (x < 0 || y < 0 || x >= SIDE || y >= SIDE) return;
    setCursor({ x, y });
    setCells((a) =>
      a.map((c, i) =>
        i === y * SIDE + x ? (erasing ? null : { color, type }) : c,
      ),
    );
  }
  function paint(e: React.PointerEvent<SVGSVGElement>) {
    // Convert into the SVG coordinate space, including aspect-ratio letterboxing.
    const matrix = e.currentTarget.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    paintCell(Math.floor(p.x), Math.floor(p.y));
  }
  function add() {
    const grouped = new Map<string, EmbroideryObject>();
    cells.forEach((cell, i) => {
      if (!cell) return;
      const key = cell.color + cell.type;
      let object = grouped.get(key);
      if (!object) {
        object = makeObject({
          id: createId(),
          name: `Cross chart · ${STITCH_NAMES[cell.type]}`,
          color: cell.color,
          type: cell.type,
          paths: [],
          closed: [],
          crossSize: size,
          crossOrder: order as "english" | "danish",
          angle: 0,
          pull: 0,
          underlay: false,
          tieIn: false,
          tieOut: false,
        });
        grouped.set(key, object);
      }
      const x = origin.x + (i % SIDE) * size,
        y = origin.y + Math.floor(i / SIDE) * size;
      object.paths.push([
        { x, y },
        { x: x + size, y },
        { x: x + size, y: y + size },
        { x, y: y + size },
      ]);
      object.closed.push(true);
    });
    onAdd([...grouped.values()]);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cross-chart-dialog">
        <DialogHeader>
          <DialogTitle>Cross-stitch chart</DialogTitle>
          <DialogDescription>
            Paint a 24 × 24 cell chart, or sample the artwork beneath it. Each
            cell uses a physical stitch grid.
          </DialogDescription>
        </DialogHeader>
        <div className="cross-layout">
          <div className="auto-settings">
            <NumberField
              label="Cross grid size"
              value={size}
              min={0.5}
              max={10}
              onChange={setSize}
            />
            <p className="help-text">
              {(25.4 / size).toFixed(1)} stitches per inch ·{" "}
              {measure.size(SIDE * size, SIDE * size)}
            </p>
            <Choice
              label="Cross method"
              value={type}
              onChange={(v) => setType(v as StitchType)}
              options={[
                "cross",
                "half-cross",
                "quarter-cross",
                "petite-cross",
              ].map((value) => ({
                value,
                label: STITCH_NAMES[value as StitchType],
              }))}
            />
            <Choice
              label="Cross-stitch order"
              value={order}
              onChange={setOrder}
              options={[
                { value: "danish", label: "Danish row order" },
                { value: "english", label: "English cell order" },
              ]}
            />
            <div className="chart-palette">
              {palette.map((c) => (
                <button
                  key={c}
                  aria-label={`Paint ${c}`}
                  aria-pressed={color === c && !erase}
                  style={{ background: c }}
                  onClick={() => {
                    setColor(c);
                    setErase(false);
                  }}
                />
              ))}
            </div>
            <label className="row">
              Custom colour
              <input
                type="color"
                aria-label="Chart paint colour"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setErase(false);
                }}
              />
            </label>
            <button
              className={`button ${erase ? "active" : ""}`}
              aria-pressed={erase}
              onClick={() => setErase((v) => !v)}
            >
              Erase cells
            </button>
            <button
              className="button"
              disabled={!history.length}
              onClick={() => {
                setCells(history.at(-1)!);
                setHistory((h) => h.slice(0, -1));
              }}
            >
              Undo chart stroke
            </button>
            <button
              className="button"
              onClick={() => {
                remember();
                setCells(
                  Array.from({ length: SIDE * SIDE }, (_, i) => {
                    const p = {
                      x: origin.x + ((i % SIDE) + 0.5) * size,
                      y: origin.y + (Math.floor(i / SIDE) + 0.5) * size,
                    };
                    const object = project.objects
                      .slice()
                      .reverse()
                      .find(
                        (o) =>
                          o.visible && inside(p, outlinePaths(o), o.fillRule),
                      );
                    return object ? { color: object.color, type } : null;
                  }),
                );
              }}
            >
              Sample current artwork
            </button>
            <button
              className="button primary"
              disabled={!cells.some(Boolean)}
              onClick={add}
            >
              Add chart to studio
            </button>
          </div>
          <div>
            <svg
              className="cross-grid"
              viewBox={`0 0 ${SIDE} ${SIDE}`}
              role="img"
              aria-label="Cross-stitch painting grid"
              aria-describedby={helpId}
              tabIndex={0}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (
                  e.ctrlKey ||
                  e.metaKey ||
                  e.altKey ||
                  e.isDefaultPrevented()
                )
                  return;
                const arrows = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                } as Record<string, number[]>;
                if (arrows[e.key]) {
                  e.preventDefault();
                  setCursor((c) => ({
                    x: Math.max(0, Math.min(SIDE - 1, c.x + arrows[e.key][0])),
                    y: Math.max(0, Math.min(SIDE - 1, c.y + arrows[e.key][1])),
                  }));
                } else if (e.key === " " || e.key === "Delete") {
                  e.preventDefault();
                  if (!e.repeat) remember();
                  paintCell(cursor.x, cursor.y, e.key === "Delete" || erase);
                }
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.focus();
                remember();
                e.currentTarget.setPointerCapture(e.pointerId);
                paint(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) paint(e);
              }}
            >
              <rect width={SIDE} height={SIDE} fill="#faf8f1" />
              {cells.map(
                (cell, i) =>
                  cell && (
                    <g
                      key={i}
                      transform={`translate(${i % SIDE} ${Math.floor(i / SIDE)})`}
                    >
                      <rect
                        width="1"
                        height="1"
                        fill={cell.color}
                        opacity=".12"
                      />
                      <path
                        d={
                          cell.type === "quarter-cross"
                            ? "M 0 1 L .5 .5"
                            : cell.type === "half-cross"
                              ? "M 0 1 L 1 0"
                              : cell.type === "petite-cross"
                                ? "M 0 0 L .5 .5 M 0 .5 L .5 0 M .5 0 L 1 .5 M .5 .5 L 1 0 M 0 .5 L .5 1 M 0 1 L .5 .5 M .5 .5 L 1 1 M .5 1 L 1 .5"
                                : "M 0 0 L 1 1 M 0 1 L 1 0"
                        }
                        stroke={cell.color}
                        strokeWidth=".12"
                      />
                    </g>
                  ),
              )}
              {Array.from({ length: SIDE + 1 }, (_, i) => (
                <path
                  key={i}
                  d={`M ${i} 0 V ${SIDE} M 0 ${i} H ${SIDE}`}
                  stroke={i % 5 ? "#d6d9da" : "#81959c"}
                  strokeWidth={i % 5 ? 0.025 : 0.05}
                />
              ))}
              {focused && (
                <rect
                  x={cursor.x + 0.05}
                  y={cursor.y + 0.05}
                  width=".9"
                  height=".9"
                  fill="none"
                  stroke="#183965"
                  strokeWidth=".12"
                />
              )}
            </svg>
            <p id={helpId} className="help-text" aria-live="polite">
              Cell {cursor.x + 1}, {cursor.y + 1} · Arrow keys move, Space
              paints, Delete erases. {cells.filter(Boolean).length} painted
              cells · drag to paint · Undo is separate from the studio until you
              add the chart.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
