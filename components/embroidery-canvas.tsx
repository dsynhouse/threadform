"use client";
import { bindViewportNavigation } from "@/lib/embroidery/viewport";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  FABRICS,
  LINE_TYPES,
  type EmbroideryObject,
  type Point,
  type Project,
  type StitchPlan,
  type StitchType,
} from "@/lib/embroidery/types";
import { bounds, distance, inside, simplify } from "@/lib/embroidery/geometry";
import { axisStep, axisValues } from "@/lib/embroidery/viewport";
import { measurementText, mmPerUnit } from "@/lib/embroidery/units";
import {
  digitizeCurve,
  reverseCurve,
  type DigitizingPoint,
} from "@/lib/embroidery/digitizing";
import { toast } from "sonner";
import {
  columnA,
  columnB,
  columnC,
  continueObject,
  widthFromReferences,
} from "@/lib/embroidery/columns";
import {
  editNodes,
  bezierNodes,
  removeNodes,
  insertNode,
  type NodeAddress,
} from "@/lib/embroidery/reshape";
import {
  createPrimitive,
  moveObject,
  outlinePaths,
  transformObject,
} from "@/lib/embroidery/operations";
export type CanvasTool =
  | "zoom"
  | "column-b"
  | "column-c"
  | "digitize-run"
  | "knife"
  | "erase"
  | "curve"
  | "select"
  | "hand"
  | "nodes"
  | "pen"
  | "rectangle"
  | "ellipse"
  | "line"
  | "freehand"
  | "satin-column"
  | "hole"
  | "angle"
  | "measure"
  | "eyedropper"
  | "manual";
export type CanvasView = "artwork" | "stitches" | "density";
export type ViewRequest = {
  id: number;
  mode: string;
  point?: Point;
  factor?: number;
};
type Props = {
  viewRequest?: ViewRequest;
  onTool?: (tool: CanvasTool) => void;
  runType?: StitchType;
  outlines?: boolean;
  needlePoints?: boolean;
  functionSymbols?: boolean;
  vectorBackdrop?: boolean;
  isolatedIds?: string[];
  onScale?: (scale: number) => void;

  showColors?: string[];
  project: Project;
  plan: StitchPlan | null;
  selected: string[];
  view: CanvasView;
  tool: CanvasTool;
  zoom: number;
  grid: boolean;
  snap: boolean;
  jumps: boolean;
  progress: number;
  reset: number;
  onSelect: (ids: string[]) => void;
  onChange: (objects: EmbroideryObject[]) => void;
  onAdd: (object: Partial<EmbroideryObject>) => void;
  onHole: (points: Point[]) => void;
  onCut?: (kind: "knife" | "erase", points: Point[]) => void;
  onAngle: (angle: number) => void;
  onColor: (color: string) => void;
  onZoom: (value: number) => void;
};
function shapePath(object: EmbroideryObject) {
  const path = new Path2D();
  outlinePaths(object).forEach((points, i) => {
    if (!points.length) return;
    path.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => path.lineTo(p.x, p.y));
    if (object.closed[i] || ["satin-column", "column-c"].includes(object.type))
      path.closePath();
  });
  return path;
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
type Gesture = { kind: string; start: Point; end: Point };
type Drag = {
  kind: string;
  start: Point;
  pan: Point;
  objects?: EmbroideryObject[];
  path?: number;
  index?: number;
  handle?: "handleIn" | "handleOut";
  anchor?: Point;
  box?: ReturnType<typeof bounds>;
};
const penTools: CanvasTool[] = [
  "pen",
  "column-b",
  "column-c",
  "digitize-run",
  "curve",
  "hole",
  "satin-column",
  "manual",
  "angle",
];
export default function EmbroideryCanvas(props: Props) {
  const {
    project,
    outlines,
    needlePoints,
    functionSymbols,
    vectorBackdrop,
    isolatedIds,
    onScale,
    showColors,
    plan,
    selected,
    view,
    tool,
    zoom,
    grid,
    snap,
    jumps,
    progress,
    reset,
    onSelect,
    onChange,
    onAdd,
    onHole,
    onCut,
    onAngle,
    onColor,
    onZoom,
  } = props;
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null),
    transform = useRef({ scale: 1, x: 0, y: 0, fit: 1, cx: 0, cy: 0 });
  const previousView = useRef<{ zoom: number; pan: Point } | null>(null);
  const [curvePoint, setCurvePoint] = useState(false);
  const [reshapeMode, setReshapeMode] = useState<
    "nodes" | "entry" | "exit" | "angle"
  >("nodes");
  const [nodeVersion, setNodeVersion] = useState(0);
  const [nodeCount, setNodeCount] = useState(0);
  const nodeRef = useRef<{ id: string; path: number; index: number } | null>(
    null,
  );
  const nodeSelection = useRef<NodeAddress[]>([]);
  function selectionChanged() {
    setNodeVersion((n) => n + 1);
    setNodeCount(nodeSelection.current.length);
  }
  function insertAt(p: Point, curve = false) {
    const object = project.objects.find((o) => o.id === selected[0]);
    if (!object || object.locked) return;
    let nearest = {
      path: -1,
      index: -1,
      distance: 8 / transform.current.scale,
    };
    object.paths.forEach((path, j) => {
      const count = object.closed[j] ? path.length : path.length - 1;
      for (let i = 0; i < count; i++) {
        const d = segmentDistance(p, path[i], path[(i + 1) % path.length]);
        if (d < nearest.distance) nearest = { path: j, index: i, distance: d };
      }
    });
    if (nearest.path < 0) return;
    onChange([
      insertNode(object, nearest.path, nearest.index, { ...p, curve }),
    ]);
    nodeSelection.current = [{ path: nearest.path, index: nearest.index + 1 }];
    nodeRef.current = { id: object.id, ...nodeSelection.current[0] };
    selectionChanged();
  }
  function alterSelectedNodes(action: "curve" | "delete" | "bezier") {
    const object = project.objects.find((o) => o.id === selected[0]);
    if (!object || object.locked || !nodeSelection.current.length) return;
    try {
      onChange([
        action === "delete"
          ? removeNodes(object, nodeSelection.current)
          : action === "bezier"
            ? bezierNodes(object, nodeSelection.current)
            : editNodes(object, nodeSelection.current, (p) => ({
                ...p,
                curve: !p.curve,
                handleIn: undefined,
                handleOut: undefined,
              })),
      ]);
      if (action === "delete") {
        nodeSelection.current = [];
        nodeRef.current = null;
      }
      selectionChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Node edit failed.");
    }
  }
  function camera(
    mode: string,
    target?: ReturnType<typeof bounds>,
    factor?: number,
  ) {
    const old = { zoom, pan };
    if (mode === "previous" && previousView.current) {
      onZoom(previousView.current.zoom);
      setPan(previousView.current.pan);
      previousView.current = old;
      return;
    }
    const t = transform.current;
    let box = target;
    if (mode === "selection")
      box = bounds(
        project.objects
          .filter((o) => selected.includes(o.id))
          .flatMap(outlinePaths),
      );
    if (mode === "artboard")
      box = { minX: 0, minY: 0, maxX: project.width, maxY: project.height };
    if (mode === "hoop")
      box = {
        minX: (project.width - project.hoopWidth) / 2,
        minY: (project.height - project.hoopHeight) / 2,
        maxX: (project.width + project.hoopWidth) / 2,
        maxY: (project.height + project.hoopHeight) / 2,
      };
    if (mode === "design")
      box = bounds(
        project.objects.filter((o) => o.visible).flatMap(outlinePaths),
      );
    let nextZoom = zoom;
    if (mode === "in") nextZoom = zoom * 2;
    if (mode === "out") nextZoom = zoom / 2;
    if (mode === "actual" || mode === "factor")
      nextZoom = ((96 / 25.4) * (factor ?? 1)) / t.fit;
    if (box && mode !== "needle")
      nextZoom =
        Math.min(
          (size.w - 100) / Math.max(1, box.maxX - box.minX),
          (size.h - 100) / Math.max(1, box.maxY - box.minY),
        ) / t.fit;
    nextZoom = Math.max(0.00001, Math.min(Math.max(80, 80 / t.fit), nextZoom));
    previousView.current = old;
    onZoom(nextZoom);
    if (box) {
      const scale = t.fit * nextZoom;
      setPan({
        x: (t.cx - (box.minX + box.maxX) / 2) * scale,
        y: (t.cy - (box.minY + box.maxY) / 2) * scale,
      });
    }
  }
  const [size, setSize] = useState({ w: 600, h: 500 }),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [draft, setDraft] = useState<EmbroideryObject[]>([]),
    [pen, setPen] = useState<DigitizingPoint[]>([]),
    [firstRail, setFirstRail] = useState<DigitizingPoint[]>([]),
    [columnBase, setColumnBase] = useState<DigitizingPoint[]>([]),
    [gesture, setGesture] = useState<Gesture | null>(null);
  const navigation = useRef({ zoom, pan, onZoom });
  useLayoutEffect(() => {
    navigation.current = { zoom, pan, onZoom };
  }, [zoom, pan, onZoom]);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    return bindViewportNavigation(
      node,
      () => ({
        ...transform.current,
        zoom: navigation.current.zoom,
        pan: navigation.current.pan,
      }),
      (next) => {
        const t = transform.current,
          scale = t.fit * next.zoom;
        // Update the imperative view immediately so events in one frame compose.
        const baseX = t.x + t.cx * t.scale - navigation.current.pan.x;
        const baseY = t.y + t.cy * t.scale - navigation.current.pan.y;
        transform.current = {
          ...t,
          scale,
          x: baseX - t.cx * scale + next.pan.x,
          y: baseY - t.cy * scale + next.pan.y,
        };
        navigation.current = { ...navigation.current, ...next };
        navigation.current.onZoom(next.zoom);
        setPan(next.pan);
      },
    );
  }, []);
  const continuation = useRef<{
    object: EmbroideryObject;
    paths: Point[][];
    fromStart: boolean;
    tool: CanvasTool;
  } | null>(null);
  const drag = useRef<Drag | null>(null),
    draftRef = useRef(draft),
    penRef = useRef(pen),
    firstRailRef = useRef(firstRail),
    columnBaseRef = useRef(columnBase),
    toolTransfer = useRef<DigitizingPoint[] | null>(null),
    gestureRef = useRef(gesture);
  useLayoutEffect(() => {
    draftRef.current = draft;
    penRef.current = pen;
    firstRailRef.current = firstRail;
    columnBaseRef.current = columnBase;
    gestureRef.current = gesture;
  }, [draft, pen, gesture, firstRail, columnBase]);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Reset imperative pointer state before the next frame after an external design change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    setPan({ x: 0, y: 0 });
    setPen([]);
    setFirstRail([]);
    setGesture(null);
  }, [reset]);
  useLayoutEffect(() => {
    if (
      continuation.current &&
      (continuation.current.tool !== tool ||
        continuation.current.object.id !== selected[0])
    )
      continuation.current = null;
    setPen(toolTransfer.current ?? []);
    toolTransfer.current = null;
    setFirstRail([]);
    setColumnBase([]);
    setGesture(null);
    nodeRef.current = null;
    nodeSelection.current = [];
    setNodeCount(0);
  }, [tool, selected]);
  /* eslint-enable react-hooks/set-state-in-effect */
  function beginContinue(fromStart = false) {
    const object = project.objects.find((o) => o.id === selected[0]);
    if (
      selected.length !== 1 ||
      !object ||
      object.locked ||
      object.closed.some(Boolean) ||
      (!LINE_TYPES.includes(object.type) && object.type !== "satin-column")
    ) {
      toast.info("Select one unlocked open run or column to extend.");
      return;
    }
    const paths = fromStart ? object.paths.map(reverseCurve) : object.paths;
    const nextTool: CanvasTool =
      object.type === "satin-column"
        ? object.columnKind === "B"
          ? "column-b"
          : "satin-column"
        : object.type === "column-c"
          ? "column-c"
          : "digitize-run";
    continuation.current = { object, paths, fromStart, tool: nextTool };
    toolTransfer.current =
      nextTool === "satin-column"
        ? paths[0].flatMap((p, i) => [p, paths[1][i]])
        : paths[0];
    props.onTool?.(nextTool);
    if (tool === nextTool) {
      setPen(toolTransfer.current);
      toolTransfer.current = null;
    }
  }
  function complete(partial: Partial<EmbroideryObject>) {
    const c = continuation.current;
    if (c) {
      onChange([continueObject(c.object, partial, c.fromStart)]);
      continuation.current = null;
    } else onAdd(partial);
  }
  function finish(points: DigitizingPoint[], keepLastStitch = true) {
    try {
      if (tool === "column-b") {
        if (points.length < 2) {
          toast.info("Draw at least two points on this edge.");
          return;
        }
        if (!firstRailRef.current.length) {
          firstRailRef.current = points;
          setFirstRail(points);
          setPen(continuation.current?.paths[1] ?? []);
          toast.info(
            "First edge captured. Draw the opposite edge, then press Enter.",
          );
          return;
        }
        complete(columnB(firstRailRef.current, points, keepLastStitch));
        firstRailRef.current = [];
        setFirstRail([]);
      } else if (tool === "satin-column") {
        if (points.length < 4 || points.length % 2) {
          toast.info("Column A needs at least two complete left/right pairs.");
          return;
        }
        complete(columnA(points, keepLastStitch));
      } else if (tool === "column-c") {
        if (!columnBaseRef.current.length) {
          if (points.length < 2) return;
          columnBaseRef.current = points;
          setColumnBase(points);
          setPen([]);
          setCurvePoint(false);
          toast.info(
            "Centreline ready. Mark two width points, or press Enter to keep the default width. Right-click width points to set an offset.",
          );
          return;
        }
        const dimensions = widthFromReferences(
          columnBaseRef.current,
          points,
          continuation.current?.object.lineWidth ?? 3,
        );
        // A continued start is entered backwards, then restored to its original
        // direction. Keep the reference offset on the same physical side.
        const offset = points.length
          ? dimensions.offset * (continuation.current?.fromStart ? -1 : 1)
          : (continuation.current?.object.columnOffset ?? 0);
        complete(columnC(columnBaseRef.current, dimensions.width, offset));
        columnBaseRef.current = [];
        setColumnBase([]);
      } else if (tool === "digitize-run") {
        if (points.length < 2) return;
        const closed =
          points.length > 3 && distance(points[0], points.at(-1)!) < 0.5;
        complete({
          name: "Digitized run",
          type: props.runType ?? "run",
          paths: [closed ? points.slice(0, -1) : points],
          closed: [closed],
          underlay: false,
          pull: 0,
        });
      } else if (tool === "hole" && points.length >= 3)
        onHole(digitizeCurve(points, true));
      else if (tool === "manual" && points.length >= 2)
        complete({
          name: "Manual stitches",
          type: "manual",
          paths: [points],
          closed: [false],
          underlay: false,
          pull: 0,
          tieIn: false,
          tieOut: false,
        });
      else if ((tool === "pen" || tool === "curve") && points.length >= 3)
        complete({
          name: tool === "curve" ? "Curved shape" : "Outline",
          paths: [
            tool === "curve"
              ? points.map((p) => ({ ...p, curve: true }))
              : points,
          ],
          closed: [true],
        });
      else return;
      setPen([]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to finish this path.",
      );
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable ||
        document.querySelector('[role="dialog"]') ||
        target.closest('[role="menu"], [role="listbox"]')
      )
        return;
      if (event.code === "Backquote") {
        event.preventDefault();
        beginContinue(event.shiftKey);
        return;
      }
      if (
        event.key === "Tab" &&
        tool === "nodes" &&
        document.activeElement === canvas.current
      ) {
        const object = project.objects.find((o) => o.id === selected[0]);
        if (object) {
          const nodes = object.paths.flatMap((path, j) =>
            path.map((_, i) => ({ path: j, index: i })),
          );
          const currentIndex = nodes.findIndex(
            (n) =>
              n.path === nodeRef.current?.path &&
              n.index === nodeRef.current?.index,
          );
          const next =
            nodes[
              (currentIndex + (event.shiftKey ? -1 : 1) + nodes.length) %
                nodes.length
            ];
          if (next) {
            event.preventDefault();
            nodeRef.current = { id: object.id, ...next };
            nodeSelection.current = [next];
            selectionChanged();
          }
        }
        return;
      }
      if (event.code === "Space" && penTools.includes(tool)) {
        event.preventDefault();
        if (
          tool === "satin-column" ||
          (tool === "column-b" && firstRailRef.current.length)
        ) {
          finish(penRef.current, false);
        } else if (tool === "column-c" || tool === "digitize-run") {
          toolTransfer.current = columnBaseRef.current.length
            ? columnBaseRef.current
            : penRef.current;
          props.onTool?.(tool === "column-c" ? "digitize-run" : "column-c");
        } else if (penRef.current.length) {
          setPen((p) =>
            p.map((v, i) =>
              i === p.length - 1 ? { ...v, curve: !v.curve } : v,
            ),
          );
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        continuation.current = null;
        if (
          !penRef.current.length &&
          !firstRailRef.current.length &&
          !drag.current
        ) {
          props.onTool?.("select");
          onSelect([]);
        }
        setPen([]);
        setFirstRail([]);
        setColumnBase([]);
        columnBaseRef.current = [];
        firstRailRef.current = [];
        setDraft([]);
        setGesture(null);
        drag.current = null;
      }
      if (event.key === "Backspace" && penTools.includes(tool)) {
        event.preventDefault();
        setPen((current) => current.slice(0, -1));
        return;
      }
      if (event.key === "Enter" && penTools.includes(tool)) {
        event.preventDefault();
        finish(penRef.current);
      }
      if (
        tool === "nodes" &&
        nodeSelection.current.length &&
        nodeRef.current?.id === selected[0]
      ) {
        if (["Delete", "Backspace"].includes(event.key)) {
          event.preventDefault();
          alterSelectedNodes("delete");
        } else if (event.code === "Space") {
          event.preventDefault();
          alterSelectedNodes("curve");
        } else if (
          event.key.startsWith("Arrow") &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          event.preventDefault();
          const o = project.objects.find((o) => o.id === selected[0]);
          if (!o) return;
          const step = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
          onChange([
            editNodes(o, nodeSelection.current, (p) => ({
              ...p,
              x:
                p.x +
                (event.key === "ArrowLeft"
                  ? -step
                  : event.key === "ArrowRight"
                    ? step
                    : 0),
              y:
                p.y +
                (event.key === "ArrowUp"
                  ? -step
                  : event.key === "ArrowDown"
                    ? step
                    : 0),
            })),
          ]);
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = size.w,
      h = size.h;
    const units = project.units ?? "mm",
      factor = mmPerUnit(units);
    const label = (value: number) => measurementText(value, units);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#edf0f4";
    ctx.fillRect(0, 0, w, h);
    const freeform = project.workspaceMode === "freeform";
    const art = bounds(
      project.objects.filter((o) => o.visible).flatMap((o) => o.paths),
    );
    const frame = freeform
      ? {
          minX: Math.min(0, art.minX),
          minY: Math.min(0, art.minY),
          maxX: Math.max(project.width, art.maxX),
          maxY: Math.max(project.height, art.maxY),
        }
      : { minX: 0, minY: 0, maxX: project.width, maxY: project.height };
    const fit = Math.max(
      Number.MIN_VALUE,
      Math.min(
        Math.max(1, w - 100) /
          ((freeform
            ? frame.maxX - frame.minX
            : Math.max(project.width, project.hoopWidth)) +
            20),
        Math.max(1, h - 100) /
          ((freeform
            ? frame.maxY - frame.minY
            : Math.max(project.height, project.hoopHeight)) +
            20),
      ),
    );
    const scale = fit * zoom,
      x = 22 + (w - 22) / 2 - ((frame.minX + frame.maxX) * scale) / 2 + pan.x,
      y = 22 + (h - 22) / 2 - ((frame.minY + frame.maxY) * scale) / 2 + pan.y;
    transform.current = {
      scale,
      x,
      y,
      fit,
      cx: (frame.minX + frame.maxX) / 2,
      cy: (frame.minY + frame.maxY) / 2,
    };
    onScale?.(scale);
    const visible = {
      minX: Math.max(0, -x / scale),
      maxX: Math.min(project.width, (w - x) / scale),
      minY: Math.max(0, -y / scale),
      maxY: Math.min(project.height, (h - y) / scale),
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.shadowColor = "#24395715";
    ctx.shadowBlur = 18 / scale;
    ctx.shadowOffsetY = 4 / scale;
    ctx.fillStyle = FABRICS[project.fabric].color;
    ctx.fillRect(0, 0, project.width, project.height);
    ctx.shadowColor = "transparent";
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, project.width, project.height);
    ctx.clip();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = "#453f3012";
    ctx.beginPath();
    const textureStep = Math.max(0.42, 0.65 / scale);
    for (const xx of axisValues(visible.minX, visible.maxX, textureStep)) {
      ctx.moveTo(xx, visible.minY);
      ctx.lineTo(xx, visible.maxY);
    }
    for (const yy of axisValues(visible.minY, visible.maxY, textureStep)) {
      ctx.moveTo(visible.minX, yy);
      ctx.lineTo(visible.maxX, yy);
    }
    ctx.stroke();
    if (grid) {
      ctx.lineWidth = 0.45 / scale;
      ctx.strokeStyle = "#8495ad30";
      ctx.beginPath();
      const gridStep =
        axisStep(scale * factor, 12, units === "in" ? 0.5 : 10) * factor;
      for (const xx of axisValues(visible.minX, visible.maxX, gridStep)) {
        ctx.moveTo(xx, visible.minY);
        ctx.lineTo(xx, visible.maxY);
      }
      for (const yy of axisValues(visible.minY, visible.maxY, gridStep)) {
        ctx.moveTo(visible.minX, yy);
        ctx.lineTo(visible.maxX, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
    if (!freeform) {
      ctx.strokeStyle = "#a7b7d1";
      ctx.lineWidth = 0.8 / scale;
      ctx.setLineDash([4 / scale, 4 / scale]);
      ctx.strokeRect(
        (project.width - project.hoopWidth) / 2,
        (project.height - project.hoopHeight) / 2,
        project.hoopWidth,
        project.hoopHeight,
      );
      ctx.setLineDash([]);
      ctx.font = `${11 / scale}px Arial`;
      ctx.fillStyle = "#8d9bb0";
      ctx.textAlign = "center";
      ctx.fillText(
        `${label(project.hoopWidth)} × ${label(project.hoopHeight)} ${units} hoop`,
        project.width / 2,
        (project.height + project.hoopHeight) / 2 + 9 / scale,
      );
    }
    const objects = project.objects
      .filter(
        (o) =>
          (!showColors?.length || showColors.includes(o.color)) &&
          (!isolatedIds?.length || isolatedIds.includes(o.id)),
      )
      .map((o) => draft.find((d) => d.id === o.id) ?? o);
    const viewVisible = new Set(
      objects.filter((o) => o.visible).map((o) => o.id),
    );
    if (view === "artwork" || !plan || draft.length || vectorBackdrop) {
      for (const o of objects) {
        if (!o.visible) continue;
        const path = shapePath(o);
        ctx.globalAlpha = o.type === "none" ? 0.22 : 1;
        if (LINE_TYPES.includes(o.type) && o.type !== "column-c") {
          ctx.strokeStyle = o.color;
          ctx.lineWidth = 0.38;
          ctx.stroke(path);
        } else {
          ctx.fillStyle = o.color;
          ctx.fill(path, o.fillRule);
        }
      }
      ctx.globalAlpha = 1;
    }
    if (view === "stitches" && plan && !draft.length) {
      const limit = Math.round((plan.stitches.length * progress) / 100);
      for (const block of plan.blocks) {
        if (
          !viewVisible.has(block.objectId) ||
          (showColors?.length && !showColors.includes(block.color)) ||
          (isolatedIds?.length && !isolatedIds.includes(block.objectId))
        )
          continue;
        if (block.start >= limit) break;
        const top = new Path2D(),
          under = new Path2D(),
          travel = new Path2D();
        for (
          let i = Math.max(1, block.start);
          i < Math.min(block.end, limit);
          i++
        ) {
          const s = plan.stitches[i],
            p = plan.stitches[i - 1];
          if (s.command === "stitch") {
            const path = s.underlay ? under : top;
            path.moveTo(p.x, p.y);
            path.lineTo(s.x, s.y);
          } else if (s.command === "jump" && jumps) {
            travel.moveTo(p.x, p.y);
            travel.lineTo(s.x, s.y);
          }
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = block.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 0.2;
        ctx.stroke(under);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 0.29;
        ctx.stroke(top);
        ctx.save();
        ctx.translate(-0.035, -0.035);
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.06;
        ctx.stroke(top);
        ctx.restore();
        if (jumps) {
          ctx.strokeStyle = "#e14c82";
          ctx.lineWidth = 0.75 / scale;
          ctx.setLineDash([3 / scale, 3 / scale]);
          ctx.stroke(travel);
          ctx.setLineDash([]);
        }
      }
      if (progress < 100 && limit > 0) {
        const current =
          plan.stitches[Math.min(limit - 1, plan.stitches.length - 1)];
        ctx.beginPath();
        ctx.moveTo(current.x - 6 / scale, current.y);
        ctx.lineTo(current.x + 6 / scale, current.y);
        ctx.moveTo(current.x, current.y - 6 / scale);
        ctx.lineTo(current.x, current.y + 6 / scale);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 4 / scale;
        ctx.stroke();
        ctx.strokeStyle = "#2554ec";
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      }
    } else if (view === "density" && plan) {
      for (const o of objects) {
        if (!o.visible) continue;
        ctx.fillStyle = "#cdd4dc";
        ctx.globalAlpha = 0.35;
        ctx.fill(shapePath(o), o.fillRule);
      }
      ctx.globalAlpha = 1;
      const cells = new Map<string, number>();
      let max = 1;
      for (const s of plan.stitches) {
        if (
          !viewVisible.has(s.objectId) ||
          s.command !== "stitch" ||
          (isolatedIds?.length && !isolatedIds.includes(s.objectId)) ||
          (showColors?.length && !showColors.includes(s.color))
        )
          continue;
        const key = `${Math.floor(s.x / 2)},${Math.floor(s.y / 2)}`,
          n = (cells.get(key) || 0) + 1;
        cells.set(key, n);
        max = Math.max(max, n);
      }
      for (const [key, n] of cells) {
        const [cx, cy] = key.split(",").map(Number),
          t = Math.sqrt(n / max);
        ctx.fillStyle = `hsla(${220 - 220 * t},85%,${62 - 14 * t}%,.76)`;
        ctx.fillRect(cx * 2, cy * 2, 2, 2);
      }
    }
    if (outlines) {
      ctx.strokeStyle = "#657c8c";
      ctx.lineWidth = 1 / scale;
      for (const o of objects) if (o.visible) ctx.stroke(shapePath(o));
    }
    if (plan && (needlePoints || functionSymbols)) {
      const limit = Math.round((plan.stitches.length * progress) / 100);
      let drawn = 0;
      for (let i = 0; i < limit; i++) {
        const p = plan.stitches[i];
        if (showColors?.length && !showColors.includes(p.color)) continue;
        if (isolatedIds?.length && !isolatedIds.includes(p.objectId)) continue;
        if (needlePoints && p.command === "stitch" && drawn++ < 50000) {
          ctx.fillStyle = "#183965";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2 / scale, 0, Math.PI * 2);
          ctx.fill();
        }
        if (functionSymbols && ["trim", "color"].includes(p.command)) {
          ctx.font = `${11 / scale}px Arial`;
          ctx.fillStyle = p.command === "trim" ? "#be3260" : "#2554ec";
          ctx.fillText(
            p.command === "trim" ? "T" : "C",
            p.x + 3 / scale,
            p.y - 3 / scale,
          );
        }
      }
    }
    for (const chosen of objects.filter(
      (o) => selected.includes(o.id) && o.visible,
    )) {
      const b = bounds(chosen.paths);
      ctx.strokeStyle = "#2b5dec";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.strokeRect(
        b.minX - 2 / scale,
        b.minY - 2 / scale,
        b.maxX - b.minX + 4 / scale,
        b.maxY - b.minY + 4 / scale,
      );
      ctx.setLineDash([]);
      ctx.fillStyle = "white";

      if (tool === "nodes" && !chosen.locked) {
        for (let j = 0; j < chosen.paths.length; j++)
          for (let i = 0; i < chosen.paths[j].length; i++) {
            const p = chosen.paths[j][i];
            if (
              p.x * scale + transform.current.x < -10 ||
              p.x * scale + transform.current.x > size.w + 10 ||
              p.y * scale + transform.current.y < -10 ||
              p.y * scale + transform.current.y > size.h + 10
            )
              continue;
            const active =
              nodeRef.current?.id === chosen.id &&
              nodeSelection.current.some((n) => n.path === j && n.index === i);
            if (active)
              for (const h of [p.handleIn, p.handleOut]) {
                if (!h) continue;
                ctx.strokeStyle = "#a389d4";
                ctx.lineWidth = 1 / scale;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(h.x, h.y);
                ctx.stroke();
                ctx.fillStyle = "#f3ecff";
                ctx.beginPath();
                ctx.arc(h.x, h.y, 3 / scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              }
            ctx.fillStyle = active ? "#6947ca" : "white";
            ctx.strokeStyle = "#6947ca";
            ctx.lineWidth = 1.2 / scale;
            if (p.curve) {
              ctx.beginPath();
              ctx.arc(p.x, p.y, 3.2 / scale, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            } else {
              ctx.fillRect(
                p.x - 3 / scale,
                p.y - 3 / scale,
                6 / scale,
                6 / scale,
              );
              ctx.strokeRect(
                p.x - 3 / scale,
                p.y - 3 / scale,
                6 / scale,
                6 / scale,
              );
            }
          }
        if (chosen.type === "satin-column" && chosen.columnKind !== "B") {
          ctx.strokeStyle = "#9074d580";
          for (let i = 0; i < chosen.paths[0].length; i++) {
            const a = chosen.paths[0][i],
              b = chosen.paths[1][i];
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const first = plan?.stitches.find(
          (s) => s.objectId === chosen.id && s.command === "stitch",
        );
        const last = plan?.stitches.findLast(
          (s) => s.objectId === chosen.id && s.command === "stitch",
        );
        for (const [point, label, color] of [
          [chosen.entryPoint ?? first, "IN", "#13877b"],
          [chosen.exitPoint ?? last, "OUT", "#d97635"],
        ] as const) {
          if (!point) continue;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5 / scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = `${12 / scale}px Arial`;
          ctx.fillText(label, point.x + 7 / scale, point.y - 7 / scale);
        }
        const cx = (b.minX + b.maxX) / 2,
          cy = (b.minY + b.maxY) / 2,
          a = (chosen.angle * Math.PI) / 180,
          r = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.35;
        ctx.strokeStyle = "#bc6195";
        ctx.setLineDash([4 / scale, 3 / scale]);
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const editable = objects.filter(
      (o) => selected.includes(o.id) && o.visible && !o.locked,
    );
    if (tool === "select" && editable.length) {
      const b = bounds(editable.flatMap((o) => o.paths));
      ctx.strokeStyle = "#2554ec";
      ctx.fillStyle = "white";
      ctx.lineWidth = 1.2 / scale;
      for (const p of [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ]) {
        ctx.fillRect(p.x - 3 / scale, p.y - 3 / scale, 6 / scale, 6 / scale);
        ctx.strokeRect(p.x - 3 / scale, p.y - 3 / scale, 6 / scale, 6 / scale);
      }
      const cx = (b.minX + b.maxX) / 2;
      ctx.beginPath();
      ctx.moveTo(cx, b.minY);
      ctx.lineTo(cx, b.minY - 14 / scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, b.minY - 14 / scale, 4 / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (draft.length) {
        ctx.font = `${11 / scale}px Arial`;
        ctx.fillStyle = "#2554ec";
        ctx.fillText(
          `${label(b.maxX - b.minX)} × ${label(b.maxY - b.minY)} ${units}`,
          cx,
          b.maxY + 13 / scale,
        );
      }
    }
    if (gesture) {
      const { start, end, kind } = gesture;
      ctx.strokeStyle = "#2554ec";
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      if (kind === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          (start.x + end.x) / 2,
          (start.y + end.y) / 2,
          Math.abs(end.x - start.x) / 2,
          Math.abs(end.y - start.y) / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      } else if (kind === "line" || kind === "measure" || kind === "knife") {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        if (kind === "measure") {
          ctx.font = `${12 / scale}px Arial`;
          ctx.fillStyle = "#2554ec";
          ctx.fillText(
            `${label(distance(start, end))} ${units}`,
            (start.x + end.x) / 2,
            (start.y + end.y) / 2 - 7 / scale,
          );
        }
      } else {
        ctx.fillStyle = "#2554ec12";
        ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      }
      ctx.setLineDash([]);
    }
    if (tool === "satin-column") {
      ctx.strokeStyle = "#2554ec55";
      ctx.lineWidth = 0.7 / scale;
      for (let i = 1; i < pen.length; i += 2) {
        ctx.beginPath();
        ctx.moveTo(pen[i - 1].x, pen[i - 1].y);
        ctx.lineTo(pen[i].x, pen[i].y);
        ctx.stroke();
      }
    }
    const draftPaths =
      tool === "satin-column"
        ? [pen.filter((_, i) => i % 2 === 0), pen.filter((_, i) => i % 2 === 1)]
        : [columnBase, firstRail, pen];
    for (const draftPath of draftPaths) {
      if (draftPath.length) {
        const plotted = digitizeCurve(
          tool === "curve"
            ? draftPath.map((p) => ({ ...p, curve: true }))
            : draftPath,
        );
        ctx.beginPath();
        ctx.moveTo(plotted[0].x, plotted[0].y);
        for (const p of plotted.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = tool === "erase" ? "#e3556477" : "#2554ec";
        ctx.lineWidth = tool === "erase" ? 3 : 1.5 / scale;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.fillStyle = "#2554ec";
        for (const p of draftPath) {
          ctx.beginPath();
          if (p.curve) ctx.arc(p.x, p.y, 3 / scale, 0, Math.PI * 2);
          else
            ctx.rect(
              p.x - 2.5 / scale,
              p.y - 2.5 / scale,
              5 / scale,
              5 / scale,
            );
          ctx.fill();
        }
      }
    }
    ctx.restore();
    ctx.fillStyle = "#f7f9fc";
    ctx.fillRect(0, 0, w, 22);
    ctx.fillRect(0, 0, 22, h);
    ctx.strokeStyle = "#d6dee8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(22, h);
    ctx.moveTo(0, 22);
    ctx.lineTo(w, 22);
    ctx.stroke();
    ctx.fillStyle = "#8b99ad";
    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    const tick =
      axisStep(scale * factor, 80, units === "in" ? 0.125 : 1) * factor;
    for (const value of axisValues((28 - x) / scale, (w - x) / scale, tick)) {
      const px = x + value * scale;
      ctx.beginPath();
      ctx.moveTo(px, 16);
      ctx.lineTo(px, 22);
      ctx.stroke();
      ctx.fillText(label(value), px + 3, 11);
    }
    for (const value of axisValues((28 - y) / scale, (h - y) / scale, tick)) {
      const py = y + value * scale;
      ctx.save();
      ctx.translate(11, py + 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label(value), 0, 0);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(16, py);
      ctx.lineTo(22, py);
      ctx.stroke();
    }
    ctx.fillStyle = "#eff3f9";
    ctx.fillRect(0, 0, 22, 22);
    ctx.fillStyle = "#8493a8";
    ctx.font = "9px Arial";
    ctx.fillText(units, 3, 14);
  }, [
    nodeVersion,
    reshapeMode,
    project,
    plan,
    selected,
    view,
    tool,
    zoom,
    grid,
    jumps,
    progress,
    size,
    pan,
    draft,
    pen,
    gesture,
    firstRail,
    columnBase,
    showColors,
    onScale,
    outlines,
    needlePoints,
    functionSymbols,
    vectorBackdrop,
    isolatedIds,
  ]);
  const world = (event: React.PointerEvent | React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect(),
      t = transform.current;
    const point = {
      x: (event.clientX - r.left - t.x) / t.scale,
      y: (event.clientY - r.top - t.y) / t.scale,
    };
    let result = snap
      ? { x: Math.round(point.x), y: Math.round(point.y) }
      : point;
    const drawing = drag.current;
    if (
      event.shiftKey &&
      drawing &&
      ["rectangle", "ellipse", "line"].includes(drawing.kind)
    ) {
      const dx = result.x - drawing.start.x,
        dy = result.y - drawing.start.y;
      if (drawing.kind === "line") {
        const angle =
            (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4,
          length = Math.hypot(dx, dy);
        result = {
          x: drawing.start.x + Math.cos(angle) * length,
          y: drawing.start.y + Math.sin(angle) * length,
        };
      } else {
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        result = {
          x: drawing.start.x + Math.sign(dx || 1) * size,
          y: drawing.start.y + Math.sign(dy || 1) * size,
        };
      }
    }
    return result;
  };
  const applyViewRequest = useEffectEvent((request: ViewRequest) =>
    camera(
      request.mode,
      request.point
        ? {
            minX: request.point.x,
            maxX: request.point.x,
            minY: request.point.y,
            maxY: request.point.y,
          }
        : undefined,
      request.factor,
    ),
  );
  useEffect(() => {
    if (props.viewRequest) applyViewRequest(props.viewRequest);
  }, [props.viewRequest]);
  const find = (p: Point) =>
    [...project.objects]
      .reverse()
      .find(
        (o) =>
          o.visible &&
          (!showColors?.length || showColors.includes(o.color)) &&
          (!isolatedIds?.length || isolatedIds.includes(o.id)) &&
          (LINE_TYPES.includes(o.type) && o.type !== "column-c"
            ? o.paths.some((path) =>
                path.some(
                  (q, i) =>
                    i > 0 &&
                    segmentDistance(p, path[i - 1], q) <
                      5 / transform.current.scale + (o.lineWidth ?? 0) / 2,
                ),
              )
            : inside(p, outlinePaths(o), o.fillRule)),
      );
  const groupIds = (object: EmbroideryObject) =>
    object.groupId
      ? project.objects
          .filter((o) => o.groupId === object.groupId && o.visible)
          .map((o) => o.id)
      : [object.id];
  return (
    <div ref={host} style={{ position: "absolute", inset: 0 }}>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label="Embroidery drawing canvas. Object and property panels provide keyboard-accessible selection and editing."
        style={{
          cursor:
            tool === "hand"
              ? "grab"
              : tool === "select" || tool === "nodes"
                ? "default"
                : "crosshair",
        }}
        onContextMenu={(event) => {
          if (penTools.includes(tool) || tool === "nodes")
            event.preventDefault();
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          if (
            event.button === 2 &&
            penTools.includes(tool) &&
            !["manual", "angle"].includes(tool)
          ) {
            event.preventDefault();
            const p = world(event);
            setPen((current) => [...current, { ...p, curve: true }]);
            return;
          }
          if (event.button === 2 && tool === "nodes") {
            event.preventDefault();
            insertAt(world(event), true);
            return;
          }
          if (event.button !== 0 && event.button !== 1) return;
          const p = world(event);
          if (event.button === 1) {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              kind: "pan",
              start: { x: event.clientX, y: event.clientY },
              pan,
            };
            return;
          }
          if (tool === "angle") {
            if (pen.length === 1) {
              const a =
                (Math.atan2(p.y - pen[0].y, p.x - pen[0].x) * 180) / Math.PI;
              onAngle((a + 180) % 180);
              setPen([]);
            } else setPen([p]);
            return;
          }
          if (penTools.includes(tool)) {
            setPen((current) => [...current, { ...p, curve: curvePoint }]);
            return;
          }
          if (tool === "eyedropper") {
            const object = find(p);
            if (object) onColor(object.color);
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          if (tool === "zoom") {
            drag.current = { kind: "zoom", start: p, pan };
            setGesture({ kind: "zoom", start: p, end: p });
            return;
          }
          if (tool === "hand") {
            drag.current = {
              kind: "pan",
              start: { x: event.clientX, y: event.clientY },
              pan,
            };
            return;
          }
          if (
            ["rectangle", "ellipse", "line", "measure", "knife"].includes(tool)
          ) {
            drag.current = { kind: tool, start: p, pan };
            setGesture({ kind: tool, start: p, end: p });
            return;
          }
          if (tool === "freehand" || tool === "erase") {
            drag.current = { kind: tool, start: p, pan };
            setPen([p]);
            return;
          }
          if (tool === "select") {
            const editable = project.objects.filter(
              (o) => selected.includes(o.id) && !o.locked && o.visible,
            );
            if (editable.length) {
              const b = bounds(editable.flatMap((o) => o.paths)),
                cx = (b.minX + b.maxX) / 2;
              if (
                distance(p, {
                  x: cx,
                  y: b.minY - 14 / transform.current.scale,
                }) <
                8 / transform.current.scale
              ) {
                drag.current = {
                  kind: "rotate",
                  start: p,
                  pan,
                  objects: editable,
                  anchor: { x: cx, y: (b.minY + b.maxY) / 2 },
                };
                return;
              }
              const corners = [
                { x: b.minX, y: b.minY },
                { x: b.maxX, y: b.minY },
                { x: b.maxX, y: b.maxY },
                { x: b.minX, y: b.maxY },
              ];
              for (let i = 0; i < corners.length; i++)
                if (distance(p, corners[i]) < 7 / transform.current.scale) {
                  drag.current = {
                    kind: "resize",
                    start: corners[i],
                    pan,
                    objects: editable,
                    box: b,
                    anchor: corners[(i + 2) % 4],
                  };
                  return;
                }
            }
          }
          const chosen = project.objects.find((o) => o.id === selected[0]);
          if (tool === "nodes" && chosen && !chosen.locked) {
            if (reshapeMode === "entry" || reshapeMode === "exit") {
              onChange([
                {
                  ...chosen,
                  [reshapeMode === "entry" ? "entryPoint" : "exitPoint"]: p,
                },
              ]);
              return;
            }
            if (reshapeMode === "angle") {
              const b = bounds(chosen.paths),
                cx = (b.minX + b.maxX) / 2,
                cy = (b.minY + b.maxY) / 2;
              onChange([
                {
                  ...chosen,
                  angle:
                    ((Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 180) %
                    180,
                },
              ]);
              return;
            }
            for (const n of nodeSelection.current) {
              const node = chosen.paths[n.path]?.[n.index];
              if (!node) continue;
              for (const handle of ["handleIn", "handleOut"] as const) {
                const h = node[handle];
                if (h && distance(p, h) < 7 / transform.current.scale) {
                  drag.current = {
                    kind: "bezier-handle",
                    start: p,
                    pan,
                    objects: [chosen],
                    path: n.path,
                    index: n.index,
                    handle,
                  };
                  return;
                }
              }
            }
            for (let j = 0; j < chosen.paths.length; j++)
              for (let i = 0; i < chosen.paths[j].length; i++)
                if (
                  distance(p, chosen.paths[j][i]) <
                  7 / transform.current.scale
                ) {
                  const n = { path: j, index: i },
                    old =
                      nodeRef.current?.id === chosen.id
                        ? nodeSelection.current
                        : [];
                  nodeSelection.current =
                    event.shiftKey || event.ctrlKey
                      ? old.some((v) => v.path === j && v.index === i)
                        ? old.filter((v) => v.path !== j || v.index !== i)
                        : [...old, n]
                      : old.some((v) => v.path === j && v.index === i)
                        ? old
                        : [n];
                  nodeRef.current = { id: chosen.id, ...n };
                  selectionChanged();
                  drag.current = {
                    kind: "node",
                    start: p,
                    pan,
                    objects: [chosen],
                    path: j,
                    index: i,
                  };
                  return;
                }
            drag.current = { kind: "node-marquee", start: p, pan };
            setGesture({ kind: "marquee", start: p, end: p });
            return;
          }
          const object = find(p);
          if (!object) {
            if (!event.shiftKey) onSelect([]);
            drag.current = { kind: "marquee", start: p, pan };
            setGesture({ kind: "marquee", start: p, end: p });
            return;
          }
          const ids = groupIds(object),
            next = event.shiftKey
              ? selected.includes(object.id)
                ? selected.filter((id) => !ids.includes(id))
                : [...new Set([...selected, ...ids])]
              : selected.includes(object.id)
                ? selected
                : ids;
          onSelect(next);
          if (!object.locked)
            drag.current = {
              kind: "object",
              start: p,
              pan,
              objects: project.objects.filter(
                (o) => next.includes(o.id) && !o.locked,
              ),
            };
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (!d) return;
          if (d.kind === "pan") {
            setPan({
              x: d.pan.x + event.clientX - d.start.x,
              y: d.pan.y + event.clientY - d.start.y,
            });
            return;
          }
          const p = world(event);
          if (
            [
              "rectangle",
              "ellipse",
              "line",
              "measure",
              "marquee",
              "zoom",
              "knife",
            ].includes(d.kind)
          ) {
            setGesture({ kind: d.kind, start: d.start, end: p });
            return;
          }
          if (d.kind === "freehand" || d.kind === "erase") {
            const points = penRef.current;
            if (
              distance(points[points.length - 1], p) > 0.2 &&
              points.length < 12000
            ) {
              penRef.current = [...points, p];
              setPen(penRef.current);
            }
            return;
          }
          if (d.kind === "resize") {
            const anchor = d.anchor!,
              sx = (p.x - anchor.x) / (d.start.x - anchor.x || 1),
              sy = (p.y - anchor.y) / (d.start.y - anchor.y || 1);
            const xScale = Math.max(
                0.01,
                event.shiftKey ? Math.max(sx, sy) : sx,
              ),
              yScale = Math.max(0.01, event.shiftKey ? Math.max(sx, sy) : sy);
            const next = d.objects!.map((o) =>
              transformObject(o, (q) => ({
                x: anchor.x + (q.x - anchor.x) * xScale,
                y: anchor.y + (q.y - anchor.y) * yScale,
              })),
            );
            draftRef.current = next;
            setDraft(next);
            return;
          }
          if (d.kind === "rotate") {
            const a = d.anchor!,
              radians =
                Math.atan2(p.y - a.y, p.x - a.x) -
                Math.atan2(d.start.y - a.y, d.start.x - a.x),
              angle = event.shiftKey
                ? Math.round(radians / (Math.PI / 12)) * (Math.PI / 12)
                : radians;
            const next = d.objects!.map((o) => ({
              ...transformObject(o, (q) => ({
                x:
                  a.x +
                  (q.x - a.x) * Math.cos(angle) -
                  (q.y - a.y) * Math.sin(angle),
                y:
                  a.y +
                  (q.x - a.x) * Math.sin(angle) +
                  (q.y - a.y) * Math.cos(angle),
              })),
              angle: (((o.angle + (angle * 180) / Math.PI) % 180) + 180) % 180,
            }));
            draftRef.current = next;
            setDraft(next);
            return;
          }
          if (d.kind === "node-marquee") {
            setGesture({ kind: "marquee", start: d.start, end: p });
            return;
          }
          if (d.kind === "bezier-handle") {
            const next = d.objects!.map((o) =>
              editNodes(o, [{ path: d.path!, index: d.index! }], (q) => ({
                ...q,
                [d.handle!]: p,
              })),
            );
            draftRef.current = next;
            setDraft(next);
            return;
          }
          if (d.kind === "node") {
            const next = d.objects!.map((o) =>
              editNodes(o, nodeSelection.current, (q) => ({
                ...q,
                x: q.x + p.x - d.start.x,
                y: q.y + p.y - d.start.y,
              })),
            );
            draftRef.current = next;
            setDraft(next);
            return;
          }
          if (d.kind === "object")
            setDraft(
              d.objects!.map((o) =>
                moveObject(o, p.x - d.start.x, p.y - d.start.y),
              ),
            );
          else
            setDraft(
              d.objects!.map((o) => ({
                ...o,
                paths: o.paths.map((path, j) =>
                  path.map((pt, i) => {
                    const paired =
                      o.closed[j] &&
                      distance(path[0], path[path.length - 1]) < 1e-7 &&
                      (d.index === 0 || d.index === path.length - 1) &&
                      (i === 0 || i === path.length - 1);
                    return j === d.path && (i === d.index || paired) ? p : pt;
                  }),
                ),
              })),
            );
        }}
        onPointerUp={(event) => {
          const d = drag.current;
          if (!d) return;
          if (draftRef.current.length) {
            onChange(draftRef.current);
            setDraft([]);
          }
          const end = world(event);
          if (
            ["rectangle", "ellipse", "line"].includes(d.kind) &&
            distance(d.start, end) > 0.3
          )
            onAdd({
              name: d.kind[0].toUpperCase() + d.kind.slice(1),
              ...createPrimitive(
                d.kind as "rectangle" | "ellipse" | "line",
                d.start,
                end,
              ),
            });
          if (d.kind === "knife" && distance(d.start, end) > 0.3)
            onCut?.("knife", [d.start, end]);
          if (d.kind === "erase" && penRef.current.length > 1) {
            onCut?.("erase", simplify([...penRef.current, end], 0.1));
            setPen([]);
          }
          if (d.kind === "freehand" && penRef.current.length > 1) {
            onAdd({
              name: "Freehand run",
              paths: [simplify(penRef.current, 0.12)],
              closed: [false],
              type: "run",
              underlay: false,
              pull: 0,
            });
            setPen([]);
          }
          if (d.kind === "zoom" && distance(d.start, end) > 0.2)
            camera("box", bounds([[d.start, end]]));
          if (d.kind === "node-marquee") {
            const o = project.objects.find((o) => o.id === selected[0]);
            if (o) {
              const hits = o.paths.flatMap((path, j) =>
                path.flatMap((p, i) =>
                  p.x >= Math.min(d.start.x, end.x) &&
                  p.x <= Math.max(d.start.x, end.x) &&
                  p.y >= Math.min(d.start.y, end.y) &&
                  p.y <= Math.max(d.start.y, end.y)
                    ? [{ path: j, index: i }]
                    : [],
                ),
              );
              nodeSelection.current = event.shiftKey
                ? [...nodeSelection.current, ...hits]
                : hits;
              nodeRef.current = hits.length ? { id: o.id, ...hits[0] } : null;
              selectionChanged();
            }
          }
          if (d.kind === "marquee") {
            const a = d.start,
              b = end;
            const hits = project.objects
              .filter((o) => {
                if (!o.visible) return false;
                const box = bounds(o.paths);
                return (
                  box.minX >= Math.min(a.x, b.x) &&
                  box.maxX <= Math.max(a.x, b.x) &&
                  box.minY >= Math.min(a.y, b.y) &&
                  box.maxY <= Math.max(a.y, b.y)
                );
              })
              .map((o) => o.id);
            onSelect(
              event.shiftKey ? [...new Set([...selected, ...hits])] : hits,
            );
          }
          if (d.kind !== "measure") setGesture(null);
          drag.current = null;
        }}
        onPointerCancel={() => {
          setDraft([]);
          setPen([]);
          setGesture(null);
          drag.current = null;
        }}
        onDoubleClick={(event) => {
          if (penTools.includes(tool) && tool !== "angle") {
            const points = [...penRef.current];
            if (
              points.length > 2 &&
              distance(points[points.length - 1], points[points.length - 2]) <
                0.5
            )
              points.pop();
            finish(points);
            return;
          }
          if (tool !== "nodes") return;
          insertAt(world(event));
        }}
      />
      {tool === "nodes" && (
        <div className="reshape-toolbar" aria-label="Reshape controls">
          {(
            [
              ["nodes", "Nodes"],
              ["entry", "Entry"],
              ["exit", "Exit"],
              ["angle", "Angle"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              aria-pressed={reshapeMode === mode}
              onClick={() => setReshapeMode(mode)}
            >
              {label}
            </button>
          ))}
          <button
            disabled={!nodeCount}
            onClick={() => alterSelectedNodes("curve")}
          >
            Corner / curve
          </button>
          <button
            disabled={!nodeCount}
            onClick={() => alterSelectedNodes("bezier")}
          >
            Bezier handles
          </button>
          <button
            disabled={selected.length !== 1}
            onClick={() => beginContinue(false)}
          >
            Extend end
          </button>
          <button
            disabled={selected.length !== 1}
            onClick={() => beginContinue(true)}
          >
            Extend start
          </button>
          <button
            disabled={!nodeCount}
            onClick={() => alterSelectedNodes("delete")}
          >
            Delete point
          </button>
          <button
            onClick={() => {
              const o = project.objects.find((o) => o.id === selected[0]);
              if (o && !o.locked)
                onChange([
                  { ...o, entryPoint: undefined, exitPoint: undefined },
                ]);
            }}
          >
            Auto entry/exit
          </button>
          <small className="reshape-readout">
            {nodeCount} selected · Shift-click adds · Arrows nudge · Space
            curves
          </small>
        </div>
      )}
      {penTools.includes(tool) && (
        <div className="digitize-prompt">
          <button
            className={!curvePoint ? "active" : ""}
            aria-pressed={!curvePoint}
            onClick={() => setCurvePoint(false)}
          >
            Corner
          </button>
          <button
            className={curvePoint ? "active" : ""}
            aria-pressed={curvePoint}
            onClick={() => setCurvePoint(true)}
          >
            Curve
          </button>
          <span>
            {tool === "column-b"
              ? firstRail.length
                ? "Edge 2"
                : "Edge 1"
              : tool === "column-c"
                ? columnBase.length
                  ? "Width / offset"
                  : "Centreline"
                : tool === "satin-column"
                  ? `Pair ${Math.floor(pen.length / 2) + 1} · ${pen.length % 2 ? "opposite edge" : "first edge"}`
                  : "Path"}{" "}
            · {pen.length} points
          </span>
          <button
            onClick={() => finish(penRef.current)}
            disabled={
              pen.length < 2 &&
              !(tool === "column-c" && columnBase.length && !pen.length)
            }
          >
            {tool === "column-b" && !firstRail.length
              ? "Next edge · Enter"
              : tool === "column-c" && !columnBase.length
                ? "Set width · Enter"
                : "Finish · Enter"}
          </button>
          {(tool === "satin-column" ||
            (tool === "column-b" && firstRail.length > 0)) && (
            <button onClick={() => finish(penRef.current, false)}>
              Omit last · Space
            </button>
          )}
          <button
            onClick={() => setPen((p) => p.slice(0, -1))}
            disabled={!pen.length}
          >
            Undo point
          </button>
        </div>
      )}
    </div>
  );
}
