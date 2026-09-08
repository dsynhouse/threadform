"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Layers3, Palette, Search } from "lucide-react";
import { analyzeColors, outlinePaths } from "@/lib/embroidery/operations";
import { bounds } from "@/lib/embroidery/geometry";
import {
  STITCH_NAMES,
  type Project,
  type StitchPlan,
} from "@/lib/embroidery/types";
import { VectorPreview } from "./vector-preview";
import { Choice } from "./controls";
import { useMeasurements } from "./measurement-units";
export default function Analysis({
  project,
  plan,
  onSelect,
  onChange,
}: {
  project: Project;
  plan: StitchPlan | null;
  onSelect: (ids: string[]) => void;
  onChange: (p: Project) => void;
}) {
  const colors = useMemo(() => analyzeColors(project, plan), [project, plan]);
  const measure = useMeasurements();
  const [selection, setSelection] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [mergeFrom, setMergeFrom] = useState(""),
    [mergeTo, setMergeTo] = useState("");
  const total = colors.reduce((n, c) => n + c.stitches, 0),
    area = colors.reduce((n, c) => n + c.areaMM2, 0);
  return (
    <section className="feature-workspace">
      <div className="feature-heading">
        <div>
          <span className="eyebrow">Understand the design</span>
          <h1>See what your embroidery is made of.</h1>
          <p>
            Inspect colour coverage, individual elements and the stitch work
            behind each one.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!selection.length}
          onClick={() => onSelect(selection)}
        >
          Edit selection
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="analysis-layout">
        <div className="feature-card analysis-preview">
          <VectorPreview
            project={project}
            selected={selection}
            onSelect={(id) => setSelection([id])}
          />
          <button className="text-button" onClick={() => setSelection([])}>
            Show every element
          </button>
          <p className="help-text">
            Click a colour or element to isolate it. Area estimates sum object
            coverage; overlapping objects count separately.
          </p>
        </div>
        <div className="feature-card">
          <h2>
            <Palette size={17} />
            Thread & colour breakdown
          </h2>
          <div className="color-table">
            {colors.map((color) => (
              <div key={color.color} className="color-table-row">
                <button
                  className="colour-summary"
                  onClick={() => setSelection(color.objectIds)}
                >
                  <span
                    className="large-swatch"
                    style={{ background: color.color }}
                  />
                  <span>
                    <strong>{color.color.toUpperCase()}</strong>
                    <small>
                      {color.objectIds.length} objects ·{" "}
                      {color.stitches.toLocaleString()} stitches
                    </small>
                  </span>
                </button>
                <div>
                  <strong>
                    {area ? Math.round((color.areaMM2 / area) * 100) : 0}% area
                  </strong>
                  <small>
                    {(color.threadMM / 1000).toFixed(1)} m path length
                  </small>
                </div>
                <label className="sr-only" htmlFor={`colour-${color.color}`}>
                  Replace {color.color}
                </label>
                <input
                  id={`colour-${color.color}`}
                  className="color-input"
                  type="color"
                  value={color.color}
                  onChange={(e) =>
                    onChange({
                      ...project,
                      objects: project.objects.map((o) =>
                        o.color === color.color && !o.locked && !o.colorLocked
                          ? { ...o, color: e.target.value, thread: undefined }
                          : o,
                      ),
                    })
                  }
                />
                <div className="colour-meter">
                  <span
                    style={{
                      background: color.color,
                      width: `${total ? (color.stitches / total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="help-text">
            Meters describe needle-path length, excluding bobbin thread, take-up
            and waste. They are not spool consumption measurements.
          </p>
          <div className="merge-colors">
            <h3>Merge thread colours</h3>
            <div className="two-fields">
              <Choice
                label="Merge colour from"
                value={mergeFrom}
                onChange={setMergeFrom}
                options={colors.map((c) => ({
                  value: c.color,
                  label: `From ${c.color.toUpperCase()}`,
                }))}
              />
              <Choice
                label="Merge colour into"
                value={mergeTo}
                onChange={setMergeTo}
                options={colors.map((c) => ({
                  value: c.color,
                  label: `Into ${c.color.toUpperCase()}`,
                }))}
              />
            </div>
            <button
              className="button"
              disabled={!mergeFrom || !mergeTo || mergeFrom === mergeTo}
              onClick={() => {
                onChange({
                  ...project,
                  objects: project.objects.map((o) =>
                    o.color === mergeFrom && !o.locked && !o.colorLocked
                      ? { ...o, color: mergeTo, thread: undefined }
                      : o,
                  ),
                });
                setMergeFrom("");
              }}
            >
              Merge unprotected colours
            </button>
          </div>
        </div>
      </div>
      <div className="feature-card element-table">
        <div className="row between">
          <h2>
            <Layers3 size={17} />
            Element breakdown{" "}
            <span className="badge">{project.objects.length}</span>
          </h2>
          <label className="search-field compact">
            <Search size={15} />
            <input
              aria-label="Find an element"
              placeholder="Find an element…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order / element</th>
                <th>Stitch method</th>
                <th>Size · {measure.unit}</th>
                <th>Contours / points</th>
                <th>Stitches</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {project.objects
                .filter((o) =>
                  o.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((o) => {
                  const b = bounds(outlinePaths(o)),
                    count =
                      plan?.blocks.find((block) => block.objectId === o.id)
                        ?.stitchCount ?? 0,
                    issues =
                      plan?.issues.filter((i) => i.objectId === o.id).length ??
                      0;
                  return (
                    <tr
                      key={o.id}
                      className={selection.includes(o.id) ? "selected" : ""}
                    >
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelection([o.id])}
                        >
                          <span
                            className="tiny-swatch"
                            style={{ background: o.color }}
                          />
                          {String(project.objects.indexOf(o) + 1).padStart(
                            2,
                            "0",
                          )}{" "}
                          {o.name}
                        </button>
                      </td>
                      <td>{STITCH_NAMES[o.type]}</td>
                      <td>
                        {measure.number(b.maxX - b.minX)} ×{" "}
                        {measure.number(b.maxY - b.minY)}
                      </td>
                      <td>
                        {o.paths.length} /{" "}
                        {o.paths.reduce((n, p) => n + p.length, 0)}
                      </td>
                      <td>{count.toLocaleString()}</td>
                      <td>
                        {!o.visible
                          ? "Hidden"
                          : o.locked
                            ? "Locked"
                            : issues
                              ? `${issues} checks`
                              : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
