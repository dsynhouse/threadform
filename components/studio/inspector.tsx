"use client";
import { UnderlayEditor } from "./underlay-editor";
import { changeStitchMethod } from "@/lib/embroidery/stitch-method";
import { AdvancedProperties, WorkspaceControls } from "./advanced-properties";
import { useState } from "react";
import {
  FlipHorizontal2,
  FlipVertical2,
  LockKeyhole,
  RotateCw,
  Settings2,
  SlidersHorizontal,
  UnlockKeyhole,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FABRICS,
  LINE_TYPES,
  STITCH_NAMES,
  type EmbroideryObject,
  type Project,
  type StitchType,
} from "@/lib/embroidery/types";
import { bounds } from "@/lib/embroidery/geometry";
import {
  flipObject,
  moveObject,
  rotateObject,
  setObjectSize,
} from "@/lib/embroidery/operations";
import { resizeProject } from "@/lib/embroidery/project";
import { useMeasurements } from "./measurement-units";
import {
  Choice,
  IconButton,
  NumberField,
  Range,
  errorMessage,
} from "./controls";
import { toast } from "sonner";
type Props = {
  project: Project;
  selected: string[];
  onChange: (objects: EmbroideryObject[]) => void;
  onProject: (p: Project) => void;
};
export default function Inspector({
  project,
  selected,
  onChange,
  onProject,
}: Props) {
  const measure = useMeasurements();
  const [tab, setTab] = useState("object"),
    [lock, setLock] = useState(true);
  const objects = project.objects.filter((o) => selected.includes(o.id)),
    object = objects[0],
    editable = objects.filter((o) => !o.locked),
    box = object ? bounds(object.paths) : null;
  const update = (changes: Partial<EmbroideryObject>) =>
    onChange(editable.map((o) => ({ ...o, ...changes })));
  const transform = (fn: (o: EmbroideryObject) => EmbroideryObject) => {
    try {
      onChange(editable.map(fn));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const documentSize = (axis: "width" | "height", value: number) => {
    try {
      onProject(
        resizeProject(
          project,
          axis === "width"
            ? value
            : lock
              ? (project.width / project.height) * value
              : project.width,
          axis === "height"
            ? value
            : lock
              ? (project.height / project.width) * value
              : project.height,
        ),
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  function setType(type: StitchType) {
    onChange(editable.map((o) => changeStitchMethod(o, type)));
  }
  return (
    <aside
      className="panel inspector"
      aria-label="Object and design properties"
    >
      <div className="panel-title">
        <h2 className="row">
          <SlidersHorizontal size={16} />
          Properties
        </h2>
        <span className="badge">{selected.length} selected</span>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="inspector-tabs">
        <TabsList>
          <TabsTrigger value="object">Selection</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "object" ? (
        <>
          {object ? (
            <>
              <div className="inspector-section">
                <label className="small-label" htmlFor="object-name">
                  {objects.length > 1 ? "First selected object" : "Object name"}
                </label>
                <input
                  id="object-name"
                  className="plain-input"
                  defaultValue={object.name}
                  key={object.id + object.name}
                  maxLength={100}
                  disabled={object.locked}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== object.name)
                      onChange([{ ...object, name: e.target.value.trim() }]);
                  }}
                />
                {objects.length > 1 && (
                  <p className="help-text">
                    Stitch and colour changes apply to all unlocked objects in
                    this selection.
                  </p>
                )}
                <div className="field" style={{ marginTop: 15 }}>
                  <span className="small-label">Artwork role</span>
                  <Choice
                    label="Artwork role"
                    value={
                      object.artworkRole ??
                      (object.type === "none" ? "reference" : "embroidery")
                    }
                    disabled={!editable.length}
                    onChange={(role) =>
                      update({
                        artworkRole: role as EmbroideryObject["artworkRole"],
                      })
                    }
                    options={[
                      { value: "embroidery", label: "Embroidery" },
                      { value: "print", label: "Printed artwork" },
                      { value: "fabric", label: "Exposed fabric" },
                      { value: "reference", label: "Reference only" },
                    ]}
                  />
                  <p className="help-text">
                    Print, fabric and reference regions stay editable without
                    generating needle points.
                  </p>
                </div>
                <label className="toggle-row">
                  Include in sewing
                  <Switch
                    checked={object.sewEnabled ?? object.visible}
                    disabled={!editable.length}
                    onCheckedChange={(sewEnabled) => update({ sewEnabled })}
                  />
                </label>
                <div className="field" style={{ marginTop: 15 }}>
                  <span className="small-label">Stitch method</span>
                  <Choice
                    label="Stitch method"
                    value={object.type}
                    disabled={!editable.length}
                    onChange={(value) => setType(value as StitchType)}
                    options={Object.entries(STITCH_NAMES)
                      .filter(
                        ([key]) =>
                          key !== "satin-column" ||
                          objects.every((o) => o.type === "satin-column"),
                      )
                      .map(([value, label]) => ({ value, label }))}
                  />
                </div>
                <div className="row between">
                  <span className="small-label">Thread colour</span>
                  <div className="row">
                    <span className="hex-label">
                      {object.color.toUpperCase()}
                    </span>
                    <input
                      aria-label="Selected thread colour"
                      className="color-input"
                      type="color"
                      value={object.color}
                      disabled={!editable.length}
                      onChange={(e) =>
                        update({ color: e.target.value, thread: undefined })
                      }
                    />
                  </div>
                </div>
              </div>
              {object.type !== "none" && (
                <div className="inspector-section">
                  <h3>
                    <Settings2 size={15} />
                    Stitch settings
                  </h3>
                  {[
                    "program-split",
                    "spiral",
                    "ripple",
                    "column-c",
                    "contour",
                    "tatami",
                    "satin",
                    "raised-satin",
                    "satin-column",
                    "wave",
                    "zigzag",
                    "blanket",
                  ].includes(object.type) && (
                    <Range
                      label={
                        [
                          "satin",
                          "satin-column",
                          "raised-satin",
                          "column-c",
                        ].includes(object.type)
                          ? "Same-edge spacing"
                          : LINE_TYPES.includes(object.type)
                            ? "Step spacing"
                            : "Row spacing"
                      }
                      value={object.spacing}
                      min={0.2}
                      max={2}
                      step={0.01}
                      unit=" mm"
                      disabled={!editable.length}
                      onChange={(spacing) => update({ spacing })}
                    />
                  )}{" "}
                  {![
                    "satin",
                    "satin-column",
                    "manual",
                    "zigzag",
                    "blanket",
                  ].includes(object.type) && (
                    <Range
                      label="Stitch length"
                      value={object.length}
                      min={0.4}
                      max={7}
                      step={0.1}
                      unit=" mm"
                      disabled={!editable.length}
                      onChange={(length) => update({ length })}
                    />
                  )}{" "}
                  {object.type !== "satin-column" &&
                    object.type !== "contour" &&
                    !LINE_TYPES.includes(object.type) && (
                      <Range
                        label="Stitch angle"
                        value={object.angle}
                        min={0}
                        max={180}
                        unit="°"
                        disabled={!editable.length}
                        onChange={(angle) => update({ angle })}
                      />
                    )}
                  {[
                    "satin",
                    "raised-satin",
                    "satin-column",
                    "column-c",
                  ].includes(object.type) && (
                    <NumberField
                      label="Maximum satin stitch"
                      value={object.satinMaxLength ?? 7}
                      min={1}
                      max={12.1}
                      unit="mm"
                      disabled={!editable.length}
                      onChange={(satinMaxLength) => update({ satinMaxLength })}
                    />
                  )}
                  {object.type === "column-c" && (
                    <NumberField
                      label="Column offset"
                      value={object.columnOffset ?? 0}
                      min={null}
                      max={null}
                      onChange={(columnOffset) => update({ columnOffset })}
                    />
                  )}
                  {object.type === "satin-column" && (
                    <label className="toggle-row">
                      Keep last column stitch
                      <Switch
                        checked={object.keepLastStitch !== false}
                        onCheckedChange={(keepLastStitch) =>
                          update({ keepLastStitch })
                        }
                        disabled={!editable.length}
                      />
                    </label>
                  )}
                  {["wave", "cross", "motif"].includes(object.type) && (
                    <Range
                      label={
                        object.type === "wave" ? "Wavelength" : "Pattern size"
                      }
                      value={object.patternSize ?? 4}
                      min={1.5}
                      max={20}
                      step={0.1}
                      unit=" mm"
                      onChange={(patternSize) => update({ patternSize })}
                      disabled={!editable.length}
                    />
                  )}{" "}
                  {["motif", "motif-run"].includes(object.type) && (
                    <Choice
                      label="Motif pattern"
                      value={object.motif ?? "diamond"}
                      onChange={(motif) =>
                        update({ motif: motif as EmbroideryObject["motif"] })
                      }
                      options={["diamond", "chevron", "star"].map((value) => ({
                        value,
                        label: value[0].toUpperCase() + value.slice(1),
                      }))}
                      disabled={!editable.length}
                    />
                  )}
                  {["zigzag", "blanket"].includes(object.type) && (
                    <Range
                      label="Outline width"
                      value={object.lineWidth ?? 3}
                      min={0.5}
                      max={12}
                      step={0.1}
                      unit=" mm"
                      onChange={(lineWidth) => update({ lineWidth })}
                      disabled={!editable.length}
                    />
                  )}
                  {object.type === "tatami" && (
                    <>
                      <Range
                        label="Tatami row stagger"
                        value={object.tatamiOffset ?? 0.25}
                        min={0}
                        max={1}
                        step={0.01}
                        disabled={!editable.length}
                        onChange={(tatamiOffset) => update({ tatamiOffset })}
                      />
                      <Range
                        label="Minimum interior stitch"
                        value={object.tatamiMinStitch ?? 0.5}
                        min={0.1}
                        max={1.5}
                        step={0.1}
                        unit=" mm"
                        disabled={!editable.length}
                        onChange={(tatamiMinStitch) =>
                          update({ tatamiMinStitch })
                        }
                      />
                      <p className="help-text">
                        Spacing measures adjacent rows. Smaller spacing gives
                        denser coverage. Fill rows connect automatically; ties
                        and edge turns may be shorter than the interior minimum.
                      </p>
                      <button
                        className="button full"
                        disabled={!editable.length}
                        title="Restore connected tatami with fabric spacing, 3 mm stitches, staggered penetrations and edge underlay. Review with a sew-out."
                        onClick={() =>
                          update({
                            type: "tatami",
                            spacing: FABRICS[project.fabric].spacing,
                            length: 3,
                            tatamiOffset: 0.25,
                            tatamiMinStitch: 0.5,
                            connector: "auto",
                            underlay: true,
                            underlayKind: "edge",
                            underlayInset: 0.65,
                            spacingEnd: undefined,
                            edgeEffect: "none",
                          })
                        }
                      >
                        Restore solid tatami settings
                      </button>
                      <label className="toggle-row">
                        Gradient density
                        <Switch
                          checked={object.spacingEnd !== undefined}
                          disabled={!editable.length}
                          onCheckedChange={(enabled) =>
                            update({
                              spacingEnd: enabled
                                ? Math.min(2, object.spacing * 3)
                                : undefined,
                            })
                          }
                        />
                      </label>
                      {object.spacingEnd !== undefined && (
                        <>
                          <Range
                            label="Spacing at far edge"
                            value={object.spacingEnd}
                            min={0.2}
                            max={2}
                            step={0.01}
                            unit=" mm"
                            disabled={!editable.length}
                            onChange={(spacingEnd) => update({ spacingEnd })}
                          />
                          <p className="help-text">
                            Density changes linearly across the fill,
                            perpendicular to the stitch direction.
                          </p>
                        </>
                      )}
                    </>
                  )}
                  {(!LINE_TYPES.includes(object.type) ||
                    object.type === "column-c") && (
                    <>
                      <label className="toggle-row">
                        Underlay
                        <Switch
                          checked={object.underlay}
                          disabled={!editable.length}
                          onCheckedChange={(underlay) => update({ underlay })}
                        />
                      </label>
                      {object.underlay && (
                        <UnderlayEditor
                          object={object}
                          update={update}
                          disabled={!editable.length}
                        />
                      )}

                      {[
                        "tatami",
                        "program-split",
                        "satin",
                        "satin-column",
                        "column-c",
                      ].includes(object.type) && (
                        <div style={{ marginTop: 16 }}>
                          <Range
                            label="Pull compensation"
                            value={object.pull}
                            min={0}
                            max={0.8}
                            step={0.01}
                            unit=" mm"
                            disabled={!editable.length}
                            onChange={(pull) => update({ pull })}
                          />
                        </div>
                      )}
                    </>
                  )}
                  <AdvancedProperties
                    object={object}
                    update={update}
                    disabled={!editable.length}
                  />
                  <label className="toggle-row">
                    Protect colour in optimization
                    <Switch
                      checked={!!object.colorLocked}
                      disabled={!editable.length}
                      onCheckedChange={(colorLocked) => update({ colorLocked })}
                    />
                  </label>
                  {["run", "triple"].includes(object.type) && (
                    <label className="toggle-row">
                      Lock sewing direction
                      <Switch
                        checked={!!object.directionLocked}
                        disabled={!editable.length}
                        onCheckedChange={(directionLocked) =>
                          update({ directionLocked })
                        }
                      />
                    </label>
                  )}
                  <label className="toggle-row">
                    Always trim after object
                    <Switch
                      checked={!!object.forceTrim}
                      disabled={!editable.length}
                      onCheckedChange={(forceTrim) => update({ forceTrim })}
                    />
                  </label>
                  <label className="toggle-row">
                    Tie-in
                    <Switch
                      checked={object.tieIn !== false}
                      disabled={!editable.length}
                      onCheckedChange={(tieIn) => update({ tieIn })}
                    />
                  </label>
                  <label className="toggle-row">
                    Tie-off
                    <Switch
                      checked={object.tieOut !== false}
                      disabled={!editable.length}
                      onCheckedChange={(tieOut) => update({ tieOut })}
                    />
                  </label>
                  {object.type === "satin-column" && (
                    <p className="help-text">
                      Alternating rail points control stitch direction. Edit the
                      rails with the node tool. Spans over 7 mm are split.
                    </p>
                  )}
                  {object.type === "manual" && (
                    <p className="help-text">
                      Each point is a needle location. Segments over 7 mm
                      receive intermediate stitches.
                    </p>
                  )}
                </div>
              )}
              {box && (
                <div className="inspector-section">
                  <h3>Position & transform</h3>
                  <div className="two-fields">
                    <NumberField
                      label="X"
                      value={box.minX}
                      min={null}
                      max={null}
                      disabled={object.locked}
                      onChange={(x) =>
                        transform((o) => moveObject(o, x - box.minX, 0))
                      }
                    />
                    <NumberField
                      label="Y"
                      value={box.minY}
                      min={null}
                      max={null}
                      disabled={object.locked}
                      onChange={(y) =>
                        transform((o) => moveObject(o, 0, y - box.minY))
                      }
                    />
                    <NumberField
                      label="Width"
                      value={box.maxX - box.minX}
                      min={0.1}
                      max={null}
                      disabled={object.locked || objects.length > 1}
                      onChange={(width) =>
                        transform((o) =>
                          setObjectSize(
                            o,
                            width,
                            lock
                              ? ((box.maxY - box.minY) * width) /
                                  (box.maxX - box.minX)
                              : box.maxY - box.minY,
                          ),
                        )
                      }
                    />
                    <NumberField
                      label="Height"
                      value={box.maxY - box.minY}
                      min={0.1}
                      max={null}
                      disabled={object.locked || objects.length > 1}
                      onChange={(height) =>
                        transform((o) =>
                          setObjectSize(
                            o,
                            lock
                              ? ((box.maxX - box.minX) * height) /
                                  (box.maxY - box.minY)
                              : box.maxX - box.minX,
                            height,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <IconButton
                      label="Lock aspect ratio"
                      active={lock}
                      onClick={() => setLock(!lock)}
                    >
                      {lock ? <LockKeyhole /> : <UnlockKeyhole />}
                    </IconButton>
                    <IconButton
                      label="Rotate selected objects 15°"
                      disabled={!editable.length}
                      onClick={() => transform((o) => rotateObject(o, 15))}
                    >
                      <RotateCw />
                    </IconButton>
                    <IconButton
                      label="Flip horizontally"
                      disabled={!editable.length}
                      onClick={() => transform((o) => flipObject(o, "x"))}
                    >
                      <FlipHorizontal2 />
                    </IconButton>
                    <IconButton
                      label="Flip vertically"
                      disabled={!editable.length}
                      onClick={() => transform((o) => flipObject(o, "y"))}
                    >
                      <FlipVertical2 />
                    </IconButton>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="inspector-section">
              <p className="help-text">
                Select an object to edit its geometry, thread and stitch
                settings. Shift-click to select several, or drag around a group
                of objects.
              </p>
              <button
                className="button full"
                style={{ marginTop: 18 }}
                onClick={() => setTab("design")}
              >
                Design & hoop settings
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="inspector-section">
            <h3>Design dimensions</h3>
            <div className="two-fields">
              <NumberField
                label="Width"
                value={project.width}
                max={null}
                onChange={(n) => documentSize("width", n)}
              />
              <NumberField
                label="Height"
                value={project.height}
                max={null}
                onChange={(n) => documentSize("height", n)}
              />
            </div>
            <label className="toggle-row">
              Lock proportions
              <Switch checked={lock} onCheckedChange={setLock} />
            </label>
            <p className="help-text">
              Resizing regenerates stitches at the selected density. All
              measurements follow the mm / inches selector above.
            </p>
          </div>
          <div className="inspector-section">
            <WorkspaceControls project={project} onProject={onProject} />
            <h3>Fabric & hoop reference</h3>
            <Choice
              label="Fabric"
              value={project.fabric}
              onChange={(fabric) =>
                onProject({ ...project, fabric: fabric as Project["fabric"] })
              }
              options={Object.entries(FABRICS).map(([value, f]) => ({
                value,
                label: f.label,
              }))}
            />
            <button
              className="text-button"
              style={{ margin: "12px 0 20px" }}
              onClick={() => {
                const preset = FABRICS[project.fabric];
                onProject({
                  ...project,
                  objects: project.objects.map((o) =>
                    o.locked
                      ? o
                      : {
                          ...o,
                          spacing: preset.spacing,
                          pull: LINE_TYPES.includes(o.type) ? 0 : preset.pull,
                        },
                  ),
                });
                toast.success("Fabric defaults applied to unlocked objects.");
              }}
            >
              Apply fabric defaults to objects
            </button>
            <Choice
              label="Hoop preset"
              value={`${project.hoopWidth}x${project.hoopHeight}`}
              onChange={(value) => {
                const [hoopWidth, hoopHeight] = value.split("x").map(Number);
                onProject({ ...project, hoopWidth, hoopHeight });
              }}
              options={[
                ...new Map(
                  [
                    [100, 100],
                    [130, 180],
                    [200, 200],
                    [300, 200],
                    [400, 300],
                    [460, 700],
                    [project.hoopWidth, project.hoopHeight],
                  ].map(([w, h]) => [
                    `${w}x${h}`,
                    { value: `${w}x${h}`, label: measure.size(w, h) },
                  ]),
                ).values(),
              ]}
            />
            <div className="two-fields" style={{ marginTop: 14 }}>
              <NumberField
                label="Hoop width"
                max={null}
                value={project.hoopWidth}
                onChange={(hoopWidth) => onProject({ ...project, hoopWidth })}
              />
              <NumberField
                label="Hoop height"
                max={null}
                value={project.hoopHeight}
                onChange={(hoopHeight) => onProject({ ...project, hoopHeight })}
              />
            </div>
            <p className="help-text">
              Use the machine’s actual sewable field. The hoop boundary is
              centred on the design.
            </p>
          </div>
          <div className="inspector-section">
            <h3>Jump connectors</h3>
            <Range
              label="Untrimmed jump limit"
              value={project.trimDistance ?? 0}
              min={0}
              max={5}
              step={0.1}
              unit=" mm"
              onChange={(trimDistance) =>
                onProject({ ...project, trimDistance })
              }
            />
            <p className="help-text">
              Zero keeps every trim. Short same-colour jumps can retain a
              floating thread. Object trim locks override this limit.
            </p>
          </div>
          <div className="inspector-section">
            <h3>Design notes</h3>
            <textarea
              className="plain-input"
              key={project.name + project.notes.join("\n")}
              defaultValue={project.notes.join("\n")}
              rows={6}
              maxLength={5000}
              onBlur={(e) => {
                const notes = e.target.value
                  .split("\n")
                  .filter(Boolean)
                  .slice(0, 20)
                  .map((x) => x.slice(0, 500));
                if (JSON.stringify(notes) !== JSON.stringify(project.notes))
                  onProject({ ...project, notes });
              }}
              aria-label="Design notes"
            />
          </div>
        </>
      )}
    </aside>
  );
}
