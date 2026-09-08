"use client";
import { createId } from "@/lib/embroidery/id";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Eraser,
  GitBranch,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Circle,
  CircleHelp,
  Cloud,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Grid2X2,
  Hand,
  Layers3,
  Loader2,
  LockKeyhole,
  Magnet,
  Maximize2,
  Minus,
  MousePointer2,
  Palette,
  Pause,
  PenLine,
  PenTool,
  Pipette,
  Play,
  Plus,
  Redo2,
  Route,
  Ruler,
  Save,
  ScanLine,
  Scissors,
  Search,
  Shapes,
  Spline,
  Square,
  Trash2,
  Type,
  Undo2,
  UnlockKeyhole,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Toaster } from "@/components/ui/sonner";
import EmbroideryCanvas, {
  type CanvasTool,
  type CanvasView,
  type ViewRequest,
} from "./embroidery-canvas";
import AutoDigitizeDialog from "./studio/auto-digitize-dialog";
import CrossChart from "./studio/cross-chart";
import QuickGuide, { ShortcutReference } from "./studio/quick-guide";
import {
  SHORTCUTS,
  matchShortcut,
  shortcutLabel,
} from "@/lib/embroidery/shortcuts";
import { changeStitchMethod } from "@/lib/embroidery/stitch-method";
import { MotifBrowser, PatternLab } from "./studio/creative-tools";
import StudioMenu, { type MenuAction } from "./studio/menu";
import Inspector from "./studio/inspector";
import Converter from "./studio/converter";
import Inspiration from "./studio/inspiration";
import Analysis from "./studio/analysis";
import Production from "./studio/production";
import Optimizer from "./studio/optimizer";
import ShapeLab from "./studio/shape-lab";
import ThreadDirectory from "./studio/thread-directory";
import ApprovalSheets from "./studio/approval-sheets";
import StitchInspector from "./studio/stitch-inspector";
import StitchLibrary from "./studio/stitch-library";
import Account from "./studio/account";
import { MachineControls } from "./studio/advanced-properties";
import { machinePreflight } from "@/lib/embroidery/machine-settings";
import { importDST } from "@/lib/embroidery/dst-import";
import { useGeometryTask } from "@/hooks/use-geometry-task";
import {
  exportCutSVG,
  type ShapeAction,
  type ShapeResult,
} from "@/lib/embroidery/shape-edit";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import ProjectBrowser from "./studio/project-browser";
import {
  Choice,
  IconButton,
  NumberField,
  download,
  errorMessage,
  fileName,
} from "./studio/controls";
import { useStudioProject } from "@/hooks/use-studio-project";
import { measurements, MeasurementProvider } from "./studio/measurement-units";
import { useStitchPlan } from "@/hooks/use-stitch-plan";
import {
  LINE_TYPES,
  STITCH_NAMES,
  makeObject,
  type StitchType,
  type EmbroideryObject,
  type Point,
  type Project,
} from "@/lib/embroidery/types";
import {
  bounds,
  inside,
  segmentInside,
  signedArea,
} from "@/lib/embroidery/geometry";
import {
  transformObject,
  emptyProject,
  moveObject,
  outlinePaths,
  separateElements,
} from "@/lib/embroidery/operations";
import { validateProject } from "@/lib/embroidery/project";
import { exportSVG } from "@/lib/embroidery/export";
import { exportObjectExchange } from "@/lib/embroidery/interoperability";
import { exportMachineBundle } from "@/lib/embroidery/native-export";
import type { MachineFormat } from "@/lib/embroidery/machine-stream";
import { createSample } from "@/lib/embroidery/samples";
import { createLettering } from "@/lib/embroidery/lettering";
type Workspace =
  | "optimize"
  | "studio"
  | "convert"
  | "analysis"
  | "inspiration"
  | "production";
const workspaceLabels: Record<Workspace, string> = {
  studio: "Studio",
  optimize: "Optimize",
  convert: "Convert",
  analysis: "Analysis",
  inspiration: "Inspiration",
  production: "Production",
};
const toolGroups = [
  {
    label: "Edit",
    tools: [
      "select",
      "nodes",
      "hand",
      "zoom",
      "knife",
      "erase",
      "hole",
      "angle",
      "measure",
      "eyedropper",
    ],
  },
  {
    label: "Draw",
    tools: ["pen", "curve", "rectangle", "ellipse", "line", "freehand"],
  },
  {
    label: "Stitch",
    tools: ["satin-column", "column-b", "column-c", "digitize-run", "manual"],
  },
];
const toolInfo: {
  id: CanvasTool;
  label: string;
  icon: typeof MousePointer2;
  hint: string;
}[] = [
  {
    id: "select",
    label: "Select · O",
    icon: MousePointer2,
    hint: "Select · Shift-click adds objects · Drag around objects to select",
  },
  {
    id: "nodes",
    label: "Reshape nodes · H",
    icon: ScanLine,
    hint: "Drag nodes · Double-click an edge to insert · Select a node, then Delete to remove",
  },
  {
    id: "hand",
    label: "Pan · P",
    icon: Hand,
    hint: "Drag to move the workspace",
  },
  {
    id: "pen",
    label: "Complex fill · F3",
    icon: PenTool,
    hint: "Click perimeter points · Enter finishes · Escape cancels",
  },
  {
    id: "curve",
    label: "Smooth contour",
    icon: Spline,
    hint: "Click points around a curved shape · Enter smooths and closes the contour",
  },
  {
    id: "rectangle",
    label: "Rectangle",
    icon: Square,
    hint: "Drag to draw a rectangle · Hold Shift for a square",
  },
  {
    id: "ellipse",
    label: "Ellipse",
    icon: Circle,
    hint: "Drag to draw an ellipse · Hold Shift for a circle",
  },
  {
    id: "line",
    label: "Running line",
    icon: Minus,
    hint: "Drag to draw a running stitch line",
  },
  {
    id: "freehand",
    label: "Freehand run",
    icon: PenLine,
    hint: "Draw freely to create an editable running path",
  },
  {
    id: "satin-column",
    label: "Column A · F4",
    icon: Spline,
    hint: "Alternate left / right points · Left-click corners, right-click curves · Enter finishes",
  },
  {
    id: "column-b",
    label: "Column B · F5",
    icon: Spline,
    hint: "Draw the first edge · Enter · Draw the opposite edge · Enter finishes · Right-click curves",
  },
  {
    id: "column-c",
    label: "Column C · F6",
    icon: Spline,
    hint: "Draw a centreline · Right-click curves · Enter finishes · Set width in Properties",
  },
  {
    id: "digitize-run",
    label: "Digitize run · F8",
    icon: PenLine,
    hint: "Left-click corners · Right-click curves · Backspace removes a point · Enter finishes",
  },
  {
    id: "knife",
    label: "Knife",
    icon: Scissors,
    hint: "Select objects · Drag a straight cut · The cut extends through the selection",
  },
  {
    id: "erase",
    label: "Erase filled geometry",
    icon: Eraser,
    hint: "Select filled objects · Drag to erase a 3 mm wide strip · Undo restores the original",
  },
  {
    id: "hole",
    label: "Cut a hole",
    icon: Shapes,
    hint: "Select a filled object · Click a closed contour inside it · Enter finishes",
  },
  {
    id: "angle",
    label: "Set stitch angle · Ctrl H",
    icon: Ruler,
    hint: "Click two points to set the selected objects’ stitch angle",
  },
  {
    id: "measure",
    label: "Measure · M",
    icon: Ruler,
    hint: "Drag between two points to measure their distance in millimetres",
  },
  {
    id: "eyedropper",
    label: "Pick a colour",
    icon: Pipette,
    hint: "Click artwork to pick its thread colour",
  },
  {
    id: "zoom",
    label: "Zoom rectangle · B",
    icon: ZoomIn,
    hint: "Drag around an area to zoom into it",
  },
  {
    id: "manual",
    label: "Manual needle points",
    icon: Plus,
    hint: "Click each needle location · Enter finishes · Escape cancels",
  },
];
export default function Studio() {
  const state = useStudioProject(),
    { project, current, commit, undo, redo } = state;
  const { plan, previewPlan, generationKey, busy, error } =
    useStitchPlan(project);
  const measure = measurements(project.units);
  const [workspace, setWorkspace] = useState<Workspace>("studio"),
    [selected, setSelected] = useState<string[]>(["arc-0-0"]),
    [view, setView] = useState<CanvasView>("stitches"),
    [tool, setTool] = useState<CanvasTool>("select");
  const [zoom, setZoom] = useState(1),
    [grid, setGrid] = useState(false),
    [snap, setSnap] = useState(false),
    [jumps, setJumps] = useState(false),
    [reset, setReset] = useState(0),
    [progress, setProgress] = useState(100),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState("8");
  const [autoOpen, setAutoOpen] = useState(false),
    [crossOpen, setCrossOpen] = useState(false),
    [quickOpen, setQuickOpen] = useState(false);
  const [runType, setRunType] = useState<StitchType>("run"),
    [viewRequest, setViewRequest] = useState<ViewRequest>(),
    [screenScale, setScreenScale] = useState(1);
  const [outlines, setOutlines] = useState(false),
    [needlePoints, setNeedlePoints] = useState(false),
    [functionSymbols, setFunctionSymbols] = useState(false),
    [vectorBackdrop, setVectorBackdrop] = useState(false),
    [objectPanel, setObjectPanel] = useState(true),
    [isolatedIds, setIsolatedIds] = useState<string[]>([]);
  const [zoomOpen, setZoomOpen] = useState(false),
    [zoomFactor, setZoomFactor] = useState(1);
  const guideWorkspace = useCallback(
    (w: string) => setWorkspace(w as Workspace),
    [setWorkspace],
  );
  const [threadsOpen, setThreadsOpen] = useState(false),
    [approvalOpen, setApprovalOpen] = useState(false),
    [stitchLibraryOpen, setStitchLibraryOpen] = useState(false),
    [inspectStitches, setInspectStitches] = useState(false),
    [shownColor, setShownColor] = useState("");
  const [importOpen, setImportOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [projectsOpen, setProjectsOpen] = useState(false),
    [letteringOpen, setLetteringOpen] = useState(false),
    [incoming, setIncoming] = useState<{
      file: File;
      namespace: string;
    } | null>(null);
  const [objectFilter, setObjectFilter] = useState(""),
    [activeColor, setActiveColor] = useState("#21776a"),
    [referencePalette, setReferencePalette] = useState<string[]>([]),
    [clipboard, setClipboard] = useState<EmbroideryObject[]>([]),
    [letterText, setLetterText] = useState("THREADFORM"),
    [letterHeight, setLetterHeight] = useState(8);
  const [motifsOpen, setMotifsOpen] = useState(false),
    [patternOpen, setPatternOpen] = useState(false),
    [commandsOpen, setCommandsOpen] = useState(false),
    [shapeOpen, setShapeOpen] = useState(false),
    [shapeAction, setShapeAction] = useState<ShapeAction>("union");
  const [pending, setPending] = useState<{
      project: Project;
      cloud?: {
        id: string;
        revision: number;
        restoredRevision?: number | null;
      };
    } | null>(null),
    [saveError, setSaveError] = useState("");
  const geometryTask = useGeometryTask<ShapeResult>();
  const fileInput = useRef<HTMLInputElement>(null);
  const chosen = project.objects.filter((o) => selected.includes(o.id)),
    primary = chosen[0],
    unlocked = chosen.filter((o) => !o.locked);
  const colors = [
      ...new Set(project.objects.filter((o) => o.visible).map((o) => o.color)),
    ],
    palette = [...new Set([...colors, ...referencePalette])];
  const selectedRef = useRef(selected);
  useLayoutEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const safeCommit = useCallback(
    (next: Project) => {
      if (!state.ready) return;
      try {
        commit(validateProject(next));
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [commit, state.ready],
  );
  const changeObjects = (changed: EmbroideryObject[]) => {
    if (!changed.length) return;
    const changes = new Map(changed.map((o) => [o.id, o]));
    safeCommit({
      ...current.current,
      objects: current.current.objects.map((o) => changes.get(o.id) ?? o),
    });
  };
  const editSelected = (changes: Partial<EmbroideryObject>) =>
    changeObjects(
      current.current.objects
        .filter((o) => selectedRef.current.includes(o.id) && !o.locked)
        .map((o) => ({ ...o, ...changes })),
    );
  const addObject = (partial: Partial<EmbroideryObject>) => {
    const p = current.current;
    if (!partial.paths?.length) return;
    const object = makeObject({
      ...partial,
      id: createId(),
      name: `${partial.name ?? "Shape"} ${p.objects.length + 1}`,
      paths: partial.paths,
      color: activeColor,
    });
    safeCommit({
      ...p,
      source: p.source === "sample" ? "manual" : p.source,
      objects: [...p.objects, object],
    });
    setSelected([object.id]);
    setTool("select");
  };
  const openNow = (
    next: Project,
    cloud?: {
      id: string;
      revision: number;
      restoredRevision?: number | null;
    },
  ) => {
    state.open(next, cloud);
    setSelected(next.objects[0] ? [next.objects[0].id] : []);
    setTool("select");
    setZoom(1);
    setReset((n) => n + 1);
    setWorkspace("studio");
    setImportOpen(false);
    setPending(null);
    setSaveError("");
  };
  function replaceProject(
    next: Project,
    cloud?: { id: string; revision: number; restoredRevision?: number | null },
  ) {
    if (!state.ready) return;
    if (state.dirty && project.objects.length) {
      setPending({ project: next, cloud });
      return;
    }
    openNow(next, cloud);
  }
  async function save(copy = false) {
    setSaveError("");
    try {
      const saved = await state.save(copy);
      if (!saved) return false;
      toast.success(
        copy ? "Saved as a new project." : "Project revision saved.",
      );
      return true;
    } catch (e) {
      setSaveError(errorMessage(e));
      toast.error(errorMessage(e), { duration: 8000 });
      return false;
    }
  }
  function downloadProject() {
    download(
      JSON.stringify(current.current, null, 2),
      fileName(current.current.name) + ".threadform.json",
      "application/json",
    );
    toast.success("Editable project downloaded.");
  }
  async function importFile(file: File) {
    if (file.size > 32 * 1024 * 1024) {
      toast.error("Choose a file under 32 MB.");
      return;
    }
    if (/\.dst$/i.test(file.name)) {
      try {
        replaceProject(
          importDST(new Uint8Array(await file.arrayBuffer()), file.name),
        );
        setImportOpen(false);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    } else if (/\.json$/i.test(file.name)) {
      try {
        replaceProject(validateProject(JSON.parse(await file.text())));
      } catch (e) {
        toast.error(errorMessage(e));
      }
    } else if (
      /\.(svg|png|jpe?g|webp)$/i.test(file.name) ||
      /^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)
    ) {
      setIncoming({ file, namespace: state.namespace });
      setImportOpen(false);
      setWorkspace("convert");
    } else
      toast.error(
        "Choose SVG, PNG, JPG, WebP, DST or a Threadform JSON project.",
      );
  }
  function autoDigitize() {
    setAutoOpen(true);
  }
  function applyMethod(type: StitchType) {
    changeObjects(unlocked.map((o) => changeStitchMethod(o, type)));
  }
  function travel(mode: string) {
    if (!plan?.stitches.length || busy) return;
    const commands = plan.stitches,
      currentIndex = Math.min(
        commands.length - 1,
        Math.max(0, Math.round((progress / 100) * commands.length) - 1),
      );
    const [kind, directionText] = mode.split(":"),
      direction = Number(directionText ?? 1);
    let next = currentIndex;
    if (kind === "start") next = -1;
    else if (kind === "end") next = commands.length - 1;
    else if (["color", "object", "function"].includes(kind)) {
      for (
        let i = currentIndex + direction;
        i >= 0 && i < commands.length;
        i += direction
      ) {
        const match =
          kind === "color"
            ? commands[i].command === "color"
            : kind === "function"
              ? ["trim", "color"].includes(commands[i].command)
              : commands[i].objectId !== commands[currentIndex].objectId;
        if (match) {
          next = i;
          break;
        }
      }
    } else {
      const count = Number(kind);
      let remaining = Math.abs(count);
      const step = Math.sign(count);
      for (
        let i = currentIndex + step;
        i >= 0 && i < commands.length;
        i += step
      ) {
        next = i;
        if (commands[i].command === "stitch" && --remaining <= 0) break;
      }
    }
    setProgress(((next + 1) / commands.length) * 100);
    setPlaying(false);
    setView("stitches");
    setInspectStitches(true);
    setWorkspace("studio");
  }
  function select(ids: string[]) {
    setSelected(ids);
    setWorkspace("studio");
  }
  function selectRow(object: EmbroideryObject, additive: boolean) {
    const ids = object.groupId
      ? project.objects
          .filter((o) => o.groupId === object.groupId)
          .map((o) => o.id)
      : [object.id];
    setSelected(
      additive
        ? selected.includes(object.id)
          ? selected.filter((id) => !ids.includes(id))
          : [...new Set([...selected, ...ids])]
        : ids,
    );
  }
  function applyColor(color: string) {
    setActiveColor(color);
    if (unlocked.length) editSelected({ color, thread: undefined });
  }
  function addHole(points: Point[]) {
    if (
      !primary ||
      chosen.length !== 1 ||
      primary.locked ||
      LINE_TYPES.includes(primary.type) ||
      primary.type === "satin-column"
    ) {
      toast.error("Select one unlocked filled object before drawing its hole.");
      return;
    }
    const paths = outlinePaths(primary);
    if (
      points.some(
        (p, i) =>
          !inside(p, paths, primary.fillRule) ||
          !segmentInside(
            p,
            points[(i + 1) % points.length],
            paths,
            primary.fillRule,
            0,
          ),
      )
    ) {
      toast.error("Keep the entire hole inside the selected filled object.");
      return;
    }
    if (primary.fillRule === "nonzero" && paths.length > 1) {
      toast.error(
        "For this compound SVG, edit the hole in the source vector or use an even-odd contour.",
      );
      return;
    }
    const contour =
      primary.fillRule === "nonzero" &&
      Math.sign(signedArea(points)) === Math.sign(signedArea(paths[0]))
        ? [...points].reverse()
        : points;
    changeObjects([
      {
        ...primary,
        paths: [...primary.paths, contour],
        closed: [...primary.closed, true],
      },
    ]);
    setTool("select");
  }
  function duplicate(source = chosen, offset = 0) {
    if (!source.length) return;
    const p = current.current;
    const groupMap = new Map<string, string>();
    const copies = source.map((o) => {
      if (o.groupId && !groupMap.has(o.groupId))
        groupMap.set(o.groupId, createId());
      return {
        ...moveObject(o, offset, offset),
        id: createId(),
        name: `${o.name} copy`.slice(0, 100),
        locked: false,
        ...(o.groupId ? { groupId: groupMap.get(o.groupId) } : {}),
      };
    });
    safeCommit({ ...p, objects: [...p.objects, ...copies] });
    setSelected(copies.map((o) => o.id));
  }
  function removeSelected() {
    if (!unlocked.length) return;
    const ids = unlocked.map((o) => o.id);
    safeCommit({
      ...project,
      objects: project.objects.filter((o) => !ids.includes(o.id)),
    });
    setSelected(selected.filter((id) => !ids.includes(id)));
  }
  function reorder(direction: number) {
    const objects = [...project.objects];
    if (direction < 0) {
      for (let i = 1; i < objects.length; i++)
        if (
          selected.includes(objects[i].id) &&
          !selected.includes(objects[i - 1].id)
        )
          [objects[i - 1], objects[i]] = [objects[i], objects[i - 1]];
    } else {
      for (let i = objects.length - 2; i >= 0; i--)
        if (
          selected.includes(objects[i].id) &&
          !selected.includes(objects[i + 1].id)
        )
          [objects[i + 1], objects[i]] = [objects[i], objects[i + 1]];
    }
    safeCommit({ ...project, objects });
  }
  function arrange(action: MenuAction) {
    if (!unlocked.length) return;
    const box = bounds(unlocked.flatMap((o) => o.paths));
    if (action === "center")
      changeObjects(
        unlocked.map((o) =>
          moveObject(
            o,
            project.width / 2 - (box.minX + box.maxX) / 2,
            project.height / 2 - (box.minY + box.maxY) / 2,
          ),
        ),
      );
    else if (
      [
        "align-left",
        "align-top",
        "align-right",
        "align-bottom",
        "align-middle-x",
        "align-middle-y",
      ].includes(action)
    )
      changeObjects(
        unlocked.map((o) => {
          const b = bounds(o.paths);
          return moveObject(
            o,
            action === "align-left"
              ? box.minX - b.minX
              : action === "align-right"
                ? box.maxX - b.maxX
                : action === "align-middle-x"
                  ? (box.minX + box.maxX - b.minX - b.maxX) / 2
                  : 0,
            action === "align-top"
              ? box.minY - b.minY
              : action === "align-bottom"
                ? box.maxY - b.maxY
                : action === "align-middle-y"
                  ? (box.minY + box.maxY - b.minY - b.maxY) / 2
                  : 0,
          );
        }),
      );
    else if (action === "distribute-x" || action === "distribute-y") {
      if (unlocked.length < 3) {
        toast.info("Select at least three objects to distribute.");
        return;
      }
      const axis = action === "distribute-x" ? "x" : "y",
        centre = (o: EmbroideryObject) => {
          const b = bounds(o.paths);
          return axis === "x" ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
        },
        sorted = [...unlocked].sort((a, b) => centre(a) - centre(b)),
        a = centre(sorted[0]),
        b = centre(sorted[sorted.length - 1]);
      changeObjects(
        sorted.map((o, i) => {
          const shift = a + ((b - a) * i) / (sorted.length - 1) - centre(o);
          return moveObject(
            o,
            axis === "x" ? shift : 0,
            axis === "y" ? shift : 0,
          );
        }),
      );
    }
  }
  function openShapeLab(action: ShapeAction = "union") {
    setShapeAction(action);
    setShapeOpen(true);
  }
  async function canvasCut(kind: "knife" | "erase", points: Point[]) {
    const original = current.current;
    try {
      const result = await geometryTask.run({
        kind: "shape",
        project: original,
        options: {
          action: kind,
          ids: selectedRef.current,
          points,
          amount: 3,
          seed: createId(),
        },
      });
      if (current.current !== original) {
        toast.info(
          "The design changed during this edit. Repeat the cut on the current design.",
        );
        return;
      }
      if (!result.changed) {
        toast.info("The cut did not cross the selected geometry.");
        return;
      }
      safeCommit(result.project);
      setSelected([]);
      setTool("select");
      if (result.notes.length) toast.info(result.notes.join(" "));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  function action(id: MenuAction | string) {
    if (id.startsWith("tool:")) {
      setTool(id.slice(5) as CanvasTool);
      setWorkspace("studio");
      return;
    }
    if (id.startsWith("run:")) {
      setRunType(id.slice(4) as StitchType);
      setTool("digitize-run");
      setWorkspace("studio");
      return;
    }
    if (id.startsWith("apply:")) {
      applyMethod(id.slice(6) as StitchType);
      return;
    }
    if (id.startsWith("travel:")) {
      travel(id.slice(7));
      return;
    }
    if (id.startsWith("zoom:")) {
      const point =
        plan?.stitches[
          Math.max(
            0,
            Math.round((progress / 100) * (plan?.stitches.length ?? 0)) - 1,
          )
        ];
      setViewRequest((previous) => ({
        id: (previous?.id ?? 0) + 1,
        mode: id.slice(5),
        ...(id === "zoom:needle" && point ? { point } : {}),
      }));
      setWorkspace("studio");
      return;
    }
    if (id === "quick-guide") {
      setQuickOpen(true);
      return;
    }
    if (id === "cross-chart") {
      setCrossOpen(true);
      return;
    }
    if (id === "zoom-factor") {
      setZoomFactor(screenScale / (96 / 25.4));
      setZoomOpen(true);
      return;
    }
    if (id === "convert") {
      setWorkspace("convert");
      return;
    }
    if (id === "cut") {
      setClipboard(structuredClone(unlocked));
      removeSelected();
      return;
    }
    if (id === "duplicate-offset") {
      duplicate(chosen, 5);
      return;
    }
    if (id === "deselect") {
      setSelected([]);
      return;
    }
    if (id === "select-color") {
      setSelected(
        project.objects
          .filter((o) => o.visible && o.color === primary?.color)
          .map((o) => o.id),
      );
      return;
    }
    if (id === "select-current") {
      const stitch =
        plan?.stitches[
          Math.max(0, Math.round((progress / 100) * plan.stitches.length) - 1)
        ];
      if (stitch) setSelected([stitch.objectId]);
      return;
    }
    if (id === "next-object" || id === "previous-object") {
      const visible = project.objects.filter((o) => o.visible);
      const index = visible.findIndex((o) => o.id === selected.at(-1));
      const next =
        visible[
          (index + (id === "next-object" ? 1 : -1) + visible.length) %
            visible.length
        ];
      if (next) setSelected([next.id]);
      return;
    }
    if (id === "lock") {
      changeObjects(chosen.map((o) => ({ ...o, locked: true })));
      return;
    }
    if (id === "unlock") {
      changeObjects(
        project.objects
          .filter((o) => o.locked)
          .map((o) => ({ ...o, locked: false })),
      );
      return;
    }
    if (id === "underlay") {
      editSelected({ underlay: !primary?.underlay });
      return;
    }
    if (id === "combine") {
      openShapeLab("union");
      return;
    }
    if (id === "mirror-x" || id === "mirror-y") {
      const b = bounds(unlocked.flatMap((o) => o.paths));
      changeObjects(
        unlocked.map((o) => ({
          ...transformObject(o, (p) => ({
            x: id === "mirror-x" ? b.minX + b.maxX - p.x : p.x,
            y: id === "mirror-y" ? b.minY + b.maxY - p.y : p.y,
          })),
          angle: (180 - o.angle) % 180,
        })),
      );
      return;
    }
    if (id === "integrity") {
      setWorkspace("production");
      return;
    }
    if (id === "object-panel") {
      setObjectPanel((v) => !v);
      return;
    }
    if (id === "toggle-thread" || id === "toggle-stitches") {
      setView((v) => (v === "stitches" ? "artwork" : "stitches"));
      return;
    }
    if (id === "toggle-outlines") {
      setOutlines((v) => !v);
      return;
    }
    if (id === "needle-points") {
      setNeedlePoints((v) => !v);
      return;
    }
    if (id === "function-symbols") {
      setFunctionSymbols((v) => !v);
      return;
    }
    if (id === "toggle-vectors") {
      setVectorBackdrop((v) => !v);
      return;
    }
    if (id === "isolate") {
      setIsolatedIds((v) => (v.length ? [] : selected));
      return;
    }
    if (id === "regenerate") {
      safeCommit({ ...project, objects: [...project.objects] });
      return;
    }
    if (id === "redraw") {
      setViewRequest((previous) => ({
        id: (previous?.id ?? 0) + 1,
        mode: "redraw",
      }));
      return;
    }
    if (id === "player") {
      if (!busy && plan) {
        if (progress >= 100) setProgress(0);
        setPlaying((v) => !v);
        setView("stitches");
        setWorkspace("studio");
      }
      return;
    }

    if (id === "approval") {
      setApprovalOpen(true);
      return;
    }
    if (id === "threads") {
      setThreadsOpen(true);
      return;
    }
    if (id === "stitch-library") {
      setStitchLibraryOpen(true);
      return;
    }
    if (id === "stitch-inspector") {
      setInspectStitches((v) => !v);
      setView("stitches");
      setWorkspace("studio");
      return;
    }
    if (id === "view-all-colours") {
      setShownColor("");
      return;
    }
    if (id === "view-colour") {
      setShownColor(primary?.color ?? colors[0] ?? "");
      setWorkspace("studio");
      return;
    }
    if (id === "freeform") {
      safeCommit({
        ...project,
        workspaceMode:
          project.workspaceMode === "freeform" ? "hoop" : "freeform",
      });
      return;
    }

    if (id === "optimize") {
      setWorkspace("optimize");
      return;
    }
    if (id === "shape-lab" || id === "applique" || id === "remove-overlaps") {
      openShapeLab(id === "shape-lab" ? "union" : id);
      return;
    }
    if (id === "knife") {
      setTool("knife");
      setWorkspace("studio");
      return;
    }
    if (id === "cut-svg") {
      try {
        download(
          exportCutSVG(project, selected, 0),
          fileName(project.name) + "-cut-lines.svg",
          "image/svg+xml",
        );
      } catch (error) {
        toast.error(errorMessage(error));
      }
      return;
    }

    if (id === "new") replaceProject(emptyProject());
    else if (id === "open") setImportOpen(true);
    else if (id === "projects") setProjectsOpen(true);
    else if (id === "save") void save();
    else if (id === "save-copy") void save(true);
    else if (id === "download") downloadProject();
    else if (id === "export") setExportOpen(true);
    else if (id === "undo") undo();
    else if (id === "redo") redo();
    else if (id === "copy") {
      setClipboard(structuredClone(chosen));
      toast.success(`${chosen.length} objects copied within the studio.`);
    } else if (id === "paste") duplicate(clipboard, 5);
    else if (id === "duplicate") duplicate();
    else if (id === "delete") removeSelected();
    else if (id === "select-all")
      setSelected(project.objects.filter((o) => o.visible).map((o) => o.id));
    else if (id === "group") {
      const groupId = createId();
      changeObjects(unlocked.map((o) => ({ ...o, groupId })));
    } else if (id === "ungroup") {
      changeObjects(
        unlocked.map((o) => {
          const next = { ...o };
          delete next.groupId;
          return next;
        }),
      );
    } else if (id === "split") {
      const objects = project.objects.flatMap((o) =>
        selected.includes(o.id) && !o.locked
          ? separateElements(o).map((part) => ({
              ...part,
              id: createId(),
            }))
          : o,
      );
      safeCommit({ ...project, objects });
      setSelected([]);
    } else if (
      [
        "center",
        "align-left",
        "align-top",
        "align-right",
        "align-bottom",
        "align-middle-x",
        "align-middle-y",
        "distribute-x",
        "distribute-y",
      ].includes(id)
    )
      arrange(id as MenuAction);
    else if (id === "front" || id === "back") {
      const a = project.objects.filter((o) => selected.includes(o.id)),
        b = project.objects.filter((o) => !selected.includes(o.id));
      safeCommit({
        ...project,
        objects: id === "front" ? [...b, ...a] : [...a, ...b],
      });
    } else if (id === "colour-order") {
      setWorkspace("optimize");
    } else if (id === "fit") {
      setViewRequest((previous) => ({
        id: (previous?.id ?? 0) + 1,
        mode: "design",
      }));
    } else if (id === "grid") setGrid(!grid);
    else if (id === "snap") setSnap(!snap);
    else if (id === "jumps") setJumps(!jumps);
    else if (["artwork", "stitches", "density"].includes(id)) {
      setView(id as CanvasView);
      setWorkspace("studio");
    } else if (id === "auto") autoDigitize();
    else if (id === "lettering") setLetteringOpen(true);
    else if (id === "guide") setHelpOpen(true);
    else if (id === "motifs") setMotifsOpen(true);
    else if (id === "pattern") setPatternOpen(true);
    else if (id === "commands") setCommandsOpen(true);
  }
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("workspace");
    if (value && Object.hasOwn(workspaceLabels, value)) {
      const frame = requestAnimationFrame(() =>
        setWorkspace(value as Workspace),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, []);
  const skipEditorUpdate = useRef(false);
  const { ready: recoveryReady, updateEditor } = state;
  useEffect(() => {
    if (!state.restoration) return;
    const e = current.current.editorState;
    const requested = new URLSearchParams(location.search).get("workspace");
    skipEditorUpdate.current = true;
    // Restore a newly opened external snapshot's saved preferences in one batch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspace(
      requested && Object.hasOwn(workspaceLabels, requested)
        ? (requested as Workspace)
        : ((e?.workspace ?? "studio") as Workspace),
    );
    setView((e?.view ?? "stitches") as CanvasView);
    setSelected(e?.selected ?? []);
    setZoom(e?.zoom ?? 1);
    setGrid(e?.grid ?? false);
    setSnap(e?.snap ?? false);
    setJumps(e?.jumps ?? false);
    setProgress(e?.progress ?? 100);
    setPlaying(false);
  }, [state.restoration, current]);
  useEffect(() => {
    if (!recoveryReady) return;
    if (skipEditorUpdate.current) {
      skipEditorUpdate.current = false;
      return;
    }
    updateEditor({
      workspace,
      view,
      selected,
      zoom,
      grid,
      snap,
      jumps,
      progress,
    });
  }, [
    recoveryReady,
    updateEditor,
    workspace,
    view,
    selected,
    zoom,
    grid,
    snap,
    jumps,
    progress,
  ]);
  const [playbackProject, setPlaybackProject] = useState(generationKey);
  if (playbackProject !== generationKey) {
    setPlaybackProject(generationKey);
    setPlaying(false);
    setProgress(100);
    if (
      shownColor &&
      !project.objects.some((o) => o.visible && o.color === shownColor)
    )
      setShownColor("");
    if (isolatedIds.length) setIsolatedIds([]);
  }
  useEffect(() => {
    if (!playing || !plan?.stitches.length) return;
    const timer = setInterval(
      () =>
        setProgress((p) =>
          Math.min(
            100,
            p +
              ((Number(speed) * 700) / 60 / plan.stitches.length) * 100 * 0.05,
          ),
        ),
      50,
    );
    return () => clearInterval(timer);
  }, [playing, speed, plan]);
  if (progress >= 100 && playing) setPlaying(false);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.getModifierState("AltGraph") ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable ||
        document.querySelector('[role="dialog"]') ||
        target.closest(
          '[role="menu"],[role="listbox"],[role="combobox"],[role="slider"]',
        )
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "tab" && target.tagName !== "CANVAS") return;
      if (
        e.repeat &&
        !["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)
      )
        return;
      if (
        workspace === "studio" &&
        ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        if (tool === "select" && unlocked.length) {
          const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          changeObjects(
            unlocked.map((o) =>
              moveObject(
                o,
                key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
                key === "arrowup" ? -step : key === "arrowdown" ? step : 0,
              ),
            ),
          );
        } else if (!selected.length)
          travel(
            String(
              key === "arrowleft"
                ? -1
                : key === "arrowright"
                  ? 1
                  : key === "arrowup"
                    ? -10
                    : 10,
            ),
          );
        return;
      }
      if (
        key === "delete" &&
        [
          "nodes",
          "pen",
          "curve",
          "satin-column",
          "column-b",
          "column-c",
          "digitize-run",
          "manual",
          "hole",
          "angle",
        ].includes(tool)
      )
        return;
      const command = matchShortcut(e);
      if (command) {
        e.preventDefault();
        action(command.id);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  const blockCounts = useMemo(
    () => new Map(plan?.blocks.map((b) => [b.objectId, b.stitchCount]) ?? []),
    [plan],
  );
  const visibleObjects = project.objects.filter((o) =>
    o.name.toLowerCase().includes(objectFilter.toLowerCase()),
  );
  const objectOrder = useMemo(
    () => new Map(project.objects.map((o, i) => [o.id, i + 1])),
    [project.objects],
  );
  const machineErrors = plan
    ? [...plan.issues, ...machinePreflight(project, plan)].filter(
        (i) => i.level === "error",
      )
    : [];
  const toolLabel = (id: CanvasTool, label: string) => {
    const key = shortcutLabel(id === "digitize-run" ? "run:run" : `tool:${id}`);
    return label.split(" · ")[0] + (key ? ` · ${key}` : "");
  };
  const toolsHint = toolInfo.find((t) => t.id === tool)?.hint;
  async function exportMachine(format: MachineFormat = "dst") {
    if (!plan || busy) return;
    try {
      download(
        await exportMachineBundle(project, plan, format),
        fileName(project.name) + "-" + format + "-embroidery.zip",
        "application/zip",
      );
      setExportOpen(false);
      toast.success(
        `${format.toUpperCase()}, file hash, thread order and editable project exported.`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <MeasurementProvider unit={project.units ?? "mm"}>
      <TooltipProvider delayDuration={250}>
        <div
          className="studio"
          aria-busy={!state.ready}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (
              e.target instanceof Element &&
              e.target.closest('[role="dialog"]')
            )
              return;
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void importFile(file);
          }}
        >
          {!state.ready && (
            <div className="studio-restoring" role="status">
              <Loader2 className="animate-spin" size={24} /> Restoring your
              studio…
            </div>
          )}
          <header className="topbar">
            <button
              className="brand brand-button"
              onClick={() => setWorkspace("studio")}
              aria-label="Threadform studio"
            >
              <span className="brand-mark">
                <Route size={21} />
              </span>
              threadform<span className="brand-dot">.</span>
            </button>
            <nav
              className="workspace-navigation"
              aria-label="Studio workspaces"
            >
              {Object.entries(workspaceLabels).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setWorkspace(value as Workspace)}
                  className={workspace === value ? "active" : ""}
                  aria-current={workspace === value ? "page" : undefined}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="top-actions">
              <Choice
                label="Measurement units"
                value={project.units ?? "mm"}
                onChange={(units) =>
                  safeCommit({ ...project, units: units as "mm" | "in" })
                }
                options={[
                  { value: "mm", label: "Millimetres · mm" },
                  { value: "in", label: "Inches · in" },
                ]}
              />
              <button
                className="top-button quick-start-button"
                onClick={() => setQuickOpen(true)}
              >
                <CircleHelp size={16} />
                <span>Quick start</span>
              </button>
              <button
                className="top-button"
                onClick={() => setProjectsOpen(true)}
              >
                <FolderOpen size={16} />
                <span>Projects</span>
              </button>
              <button
                className="top-button"
                aria-label="Find a command"
                onClick={() => setCommandsOpen(true)}
              >
                <Search size={16} />
              </button>
              <button
                className="top-button"
                aria-label="Studio guide"
                onClick={() => setHelpOpen(true)}
              >
                <CircleHelp size={17} />
              </button>
              <Account />
            </div>
          </header>
          <div className="document-bar">
            <div>
              <input
                className="document-name"
                aria-label="Design name"
                defaultValue={project.name}
                key={project.name}
                maxLength={100}
                onBlur={(e) => {
                  const name = e.target.value.trim() || "Untitled design";
                  if (name !== project.name) safeCommit({ ...project, name });
                }}
              />
              <div className="document-meta">
                <span className={`save-dot ${state.dirty ? "dirty" : ""}`} />
                <span>
                  {!state.ready
                    ? "Restoring your studio…"
                    : state.saving
                      ? "Saving…"
                      : state.dirty
                        ? state.recoveryTime
                          ? "Local recovery active · online save pending"
                          : "Changes pending"
                        : state.saved
                          ? `Saved · revision ${state.saved.revision}`
                          : "Sample design"}
                </span>
                <span>·</span>
                <span className="badge">
                  Studio 0.10 · Qualification pending
                </span>
              </div>
            </div>
            <div className="row">
              <button
                className="button"
                onClick={() => void save()}
                disabled={state.saving || !state.ready}
              >
                {state.saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Cloud size={16} />
                )}
                <span className="optional-label">Save project</span>
              </button>
              <button
                className="button soft"
                onClick={() => setWorkspace("optimize")}
              >
                <GitBranch size={16} />
                <span className="optional-label">Optimize</span>
              </button>
              <button
                className="button soft"
                onClick={autoDigitize}
                disabled={busy || !project.objects.length}
              >
                <Wand2 size={16} />
                <span className="optional-label">Auto-digitize</span>
              </button>
              <button
                className="button primary"
                onClick={() => setExportOpen(true)}
                disabled={busy || !plan?.stitchCount || !!error}
              >
                <Download size={16} />
                Export
              </button>
            </div>
          </div>
          {saveError && (
            <div className="save-error" role="alert">
              <AlertTriangle size={16} />
              <span>{saveError}</span>
              <button onClick={() => void save(true)}>Save a copy</button>
              <button onClick={downloadProject}>Download project</button>
            </div>
          )}
          {(state.syncError || state.recoveryError) && (
            <div className="save-error" role="status">
              <span>{state.syncError || state.recoveryError}</span>
              <button onClick={() => void save()}>Retry save</button>
              <button onClick={() => void save(true)}>Save a copy</button>
              <button onClick={downloadProject}>Download project</button>
            </div>
          )}
          <input
            className="sr-only"
            ref={fileInput}
            type="file"
            accept=".svg,.png,.jpg,.jpeg,.webp,.dst,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
          {workspace === "studio" && (
            <>
              <StudioMenu
                onAction={action}
                canUndo={state.canUndo}
                canRedo={state.canRedo}
                hasSelection={chosen.length > 0}
                hasClipboard={clipboard.length > 0}
                saving={state.saving}
              />
              <main
                className={`workspace ${objectPanel ? "" : "objects-collapsed"}`}
              >
                <aside
                  className="panel objects-panel"
                  hidden={!objectPanel}
                  aria-label="Embroidery objects"
                >
                  <div className="panel-title">
                    <h2 className="row">
                      <Layers3 size={16} />
                      Objects
                    </h2>
                    <span className="badge">{project.objects.length}</span>
                  </div>
                  <label className="object-search">
                    <Search size={14} />
                    <input
                      aria-label="Find objects"
                      placeholder="Find an object…"
                      value={objectFilter}
                      onChange={(e) => setObjectFilter(e.target.value)}
                    />
                  </label>
                  <div className="object-group">
                    <span className="eyebrow">Sewing order</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      First → last
                    </span>
                  </div>
                  <div className="object-list">
                    {visibleObjects.map((o) => (
                      <div
                        key={o.id}
                        className={`object-row ${selected.includes(o.id) ? "selected" : ""}`}
                        style={{ opacity: o.visible ? 1 : 0.5 }}
                      >
                        <button
                          className="object-main"
                          onClick={(e) => selectRow(o, e.shiftKey)}
                          aria-label={`Select ${o.name}`}
                          aria-pressed={selected.includes(o.id)}
                        >
                          <span
                            className="object-swatch"
                            style={{ background: o.color }}
                          >
                            <span>
                              {String(objectOrder.get(o.id)).padStart(2, "0")}
                            </span>
                          </span>
                          <span className="object-text">
                            <strong>
                              {o.groupId && <span className="group-dot" />}
                              {o.name}
                            </strong>
                            <small>
                              {STITCH_NAMES[o.type]} ·{" "}
                              {(blockCounts.get(o.id) ?? 0).toLocaleString()}
                            </small>
                          </span>
                        </button>
                        <IconButton
                          label={
                            o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`
                          }
                          onClick={() =>
                            changeObjects([{ ...o, locked: !o.locked }])
                          }
                        >
                          {o.locked ? (
                            <LockKeyhole />
                          ) : (
                            <UnlockKeyhole style={{ opacity: 0.45 }} />
                          )}
                        </IconButton>
                        <IconButton
                          label={
                            o.visible
                              ? `Hide ${o.name} in view`
                              : `Show ${o.name} in view`
                          }
                          onClick={() =>
                            changeObjects([{ ...o, visible: !o.visible }])
                          }
                        >
                          {o.visible ? <Eye /> : <EyeOff />}
                        </IconButton>
                      </div>
                    ))}
                    {!visibleObjects.length && (
                      <p className="help-text" style={{ padding: 12 }}>
                        {objectFilter
                          ? "No objects match your search."
                          : "Draw a shape or import artwork to begin."}
                      </p>
                    )}
                  </div>
                  <div className="object-controls">
                    <IconButton
                      label="Sew earlier"
                      disabled={!chosen.length}
                      onClick={() => reorder(-1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      label="Sew later"
                      disabled={!chosen.length}
                      onClick={() => reorder(1)}
                    >
                      <ArrowDown />
                    </IconButton>
                    <IconButton
                      label="Duplicate selection"
                      disabled={!chosen.length}
                      onClick={() => duplicate()}
                    >
                      <Copy />
                    </IconButton>
                    <IconButton
                      label="Group selected objects"
                      disabled={unlocked.length < 2}
                      onClick={() => action("group")}
                    >
                      <Layers3 />
                    </IconButton>
                    <IconButton
                      label="Delete selection"
                      disabled={!unlocked.length}
                      onClick={removeSelected}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                  <div className="left-footer">
                    <div className="row between">
                      <button
                        className="text-button"
                        onClick={() => setThreadsOpen(true)}
                      >
                        Thread directory ↗
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setWorkspace("analysis")}
                        aria-label="Open colour analysis"
                      >
                        <Palette size={15} />
                      </button>
                    </div>
                    <div className="field">
                      <Choice
                        label="View by colour"
                        value={shownColor || "all"}
                        onChange={(v) => setShownColor(v === "all" ? "" : v)}
                        options={[
                          { value: "all", label: "View all colours" },
                          ...colors.map((value) => ({
                            value,
                            label: `View ${value.toUpperCase()}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="palette">
                      {palette.map((color) => (
                        <button
                          className={`palette-color ${activeColor === color ? "active" : ""}`}
                          key={color}
                          style={{ background: color }}
                          aria-label={`Use thread colour ${color}`}
                          onClick={() => applyColor(color)}
                        />
                      ))}
                      <label
                        className="custom-color"
                        title="Choose a thread colour"
                      >
                        <Plus size={14} />
                        <input
                          type="color"
                          aria-label="Choose a thread colour"
                          value={activeColor}
                          onChange={(e) => applyColor(e.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      className="button full"
                      onClick={() => setImportOpen(true)}
                    >
                      <Upload size={15} />
                      Import artwork
                    </button>
                    <p className="help-text">
                      Physical units · editable geometry · actual stitch paths
                    </p>
                  </div>
                </aside>
                <div className="canvas-column">
                  <div className="canvas-toolbar">
                    {!objectPanel && (
                      <IconButton
                        label="Show colour-object panel · Shift L"
                        onClick={() => setObjectPanel(true)}
                      >
                        <Layers3 />
                      </IconButton>
                    )}
                    <Tabs
                      value={view}
                      onValueChange={(value) => setView(value as CanvasView)}
                      className="view-tabs"
                    >
                      <TabsList>
                        <TabsTrigger value="stitches">Stitches</TabsTrigger>
                        <TabsTrigger value="artwork">Artwork</TabsTrigger>
                        <TabsTrigger value="density">Density</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="toolbar-end">
                      <IconButton
                        label="Undo"
                        disabled={!state.canUndo}
                        onClick={undo}
                      >
                        <Undo2 />
                      </IconButton>
                      <IconButton
                        label="Redo"
                        disabled={!state.canRedo}
                        onClick={redo}
                      >
                        <Redo2 />
                      </IconButton>
                      <span className="toolbar-divider" />
                      <IconButton
                        label="Adaptive measurement grid"
                        active={grid}
                        onClick={() => setGrid(!grid)}
                      >
                        <Grid2X2 />
                      </IconButton>
                      <IconButton
                        label="Snap to 1 mm"
                        active={snap}
                        onClick={() => setSnap(!snap)}
                      >
                        <Magnet />
                      </IconButton>
                      <IconButton
                        label="Show jump paths"
                        active={jumps}
                        onClick={() => setJumps(!jumps)}
                      >
                        <Scissors />
                      </IconButton>
                    </div>
                  </div>
                  <div className="canvas-surface">
                    <EmbroideryCanvas
                      project={project}
                      plan={plan ?? previewPlan}
                      selected={selected}
                      view={view}
                      tool={tool}
                      zoom={zoom}
                      grid={grid}
                      snap={snap}
                      jumps={jumps}
                      showColors={shownColor ? [shownColor] : undefined}
                      progress={progress}
                      reset={reset}
                      onSelect={setSelected}
                      onChange={changeObjects}
                      onAdd={addObject}
                      onHole={addHole}
                      onCut={(kind, points) => void canvasCut(kind, points)}
                      onAngle={(angle) => editSelected({ angle })}
                      onColor={applyColor}
                      onZoom={setZoom}
                      onScale={setScreenScale}
                      viewRequest={viewRequest}
                      onTool={setTool}
                      runType={runType}
                      outlines={outlines}
                      needlePoints={needlePoints}
                      functionSymbols={functionSymbols}
                      vectorBackdrop={vectorBackdrop}
                      isolatedIds={isolatedIds}
                    />
                    <div className="tool-rail">
                      <div className="tool-group-tabs" aria-label="Tool groups">
                        {toolGroups.map((group) => (
                          <button
                            key={group.label}
                            aria-pressed={group.tools.includes(tool)}
                            onClick={() =>
                              setTool(group.tools[0] as CanvasTool)
                            }
                          >
                            {group.label}
                          </button>
                        ))}
                      </div>
                      {toolInfo
                        .filter(({ id }) =>
                          (
                            toolGroups.find((group) =>
                              group.tools.includes(tool),
                            ) ?? toolGroups[0]
                          ).tools.includes(id),
                        )
                        .map(({ id, label, icon: Icon, hint }) => (
                          <IconButton
                            key={id}
                            label={toolLabel(id, label)}
                            help={hint}
                            active={tool === id}
                            onClick={() => setTool(id)}
                            disabled={
                              geometryTask.busy ||
                              (["knife", "erase"].includes(id) &&
                                !unlocked.length) ||
                              (id === "hole" &&
                                (chosen.length !== 1 ||
                                  primary?.locked ||
                                  LINE_TYPES.includes(
                                    primary?.type ?? "none",
                                  ) ||
                                  primary?.type === "satin-column"))
                            }
                          >
                            {["satin-column", "column-b", "column-c"].includes(
                              id,
                            ) ? (
                              <span className="column-tool-letter">
                                {id === "satin-column"
                                  ? "A"
                                  : id === "column-b"
                                    ? "B"
                                    : "C"}
                              </span>
                            ) : (
                              <Icon size={17} />
                            )}
                          </IconButton>
                        ))}
                      <div className="tool-divider" />
                      <span className="tool-rail-label">Workshop</span>
                      <IconButton
                        label="Stitch methods · 32 types"
                        onClick={() => setStitchLibraryOpen(true)}
                      >
                        <Spline />
                      </IconButton>
                      <IconButton
                        label="Cross-stitch chart"
                        onClick={() => setCrossOpen(true)}
                      >
                        <Grid2X2 />
                      </IconButton>
                      <IconButton
                        label="Shape & cutting workshop"
                        disabled={!unlocked.length}
                        onClick={() => openShapeLab()}
                      >
                        <Scissors />
                      </IconButton>
                      <IconButton
                        label="Shapes, motifs & palettes"
                        onClick={() => setMotifsOpen(true)}
                      >
                        <Shapes />
                      </IconButton>
                      <IconButton
                        label="Pattern lab"
                        disabled={!unlocked.length}
                        onClick={() => setPatternOpen(true)}
                      >
                        <Grid2X2 />
                      </IconButton>
                      <IconButton
                        label="Single-line lettering"
                        onClick={() => setLetteringOpen(true)}
                      >
                        <Type />
                      </IconButton>
                    </div>
                    <div className="canvas-caption">
                      {project.name.toUpperCase()}{" "}
                      <span>
                        {" "}
                        / {project.width.toFixed(0)} ×{" "}
                        {project.height.toFixed(0)} MM
                      </span>
                    </div>
                    <div className="canvas-bottom">
                      <div className="zoom-control">
                        <IconButton
                          label="Zoom out"
                          onClick={() =>
                            setZoom((z) => Math.max(0.00001, z / 1.2))
                          }
                        >
                          <ZoomOut />
                        </IconButton>
                        <button
                          className="zoom-value"
                          title="Set zoom factor · F"
                          onClick={() => action("zoom-factor")}
                        >
                          {Math.round((screenScale / (96 / 25.4)) * 100)}%
                        </button>
                        <IconButton
                          label="Zoom in"
                          onClick={() =>
                            setZoom(
                              (z) =>
                                z *
                                Math.min(1.2, Math.max(1, 80 / screenScale)),
                            )
                          }
                        >
                          <ZoomIn />
                        </IconButton>
                      </div>
                      <div className="zoom-control">
                        <IconButton
                          label="Fit design"
                          onClick={() => action("fit")}
                        >
                          <Maximize2 />
                        </IconButton>
                      </div>
                    </div>
                    {(busy || geometryTask.busy) && (
                      <div className="generation-badge">
                        <Loader2 size={14} className="animate-spin" />
                        {geometryTask.busy
                          ? "Editing geometry"
                          : previewPlan
                            ? "Updating stitches · previous preview"
                            : "Generating stitches"}
                      </div>
                    )}
                    {error && (
                      <div className="canvas-error" role="alert">
                        <AlertTriangle size={20} />
                        <span>{error}</span>
                      </div>
                    )}
                    {view === "density" && (
                      <div className="density-legend">
                        Lower <span /> Higher · relative needle points / 2 mm
                        cell
                      </div>
                    )}
                  </div>
                  <div className="tool-hint">
                    <span className="hint-key">
                      {
                        toolInfo
                          .find((t) => t.id === tool)
                          ?.label.split(" · ")[0]
                      }
                    </span>
                    {toolsHint}
                  </div>
                  <div className="simulation">
                    <div className="simulation-top">
                      <button
                        className="play-button"
                        aria-label={
                          playing
                            ? "Pause simulation"
                            : "Play stitch simulation"
                        }
                        disabled={busy || !plan?.stitchCount}
                        onClick={() => {
                          if (progress >= 100) setProgress(0);
                          setPlaying(!playing);
                          setView("stitches");
                        }}
                      >
                        {playing ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setInspectStitches((v) => !v);
                          setView("stitches");
                        }}
                      >
                        Stitch inspector {inspectStitches ? "▾" : "▸"}
                      </button>
                      <div className="speed-select">
                        <Choice
                          label="Simulation speed"
                          value={speed}
                          onChange={setSpeed}
                          options={[1, 4, 8, 16, 32].map((n) => ({
                            value: String(n),
                            label: `${n}×`,
                          }))}
                        />
                      </div>
                      <span className="simulation-counter">
                        {Math.round(
                          ((plan?.stitches.length ?? 0) * progress) / 100,
                        ).toLocaleString()}{" "}
                        / {(plan?.stitches.length ?? 0).toLocaleString()}{" "}
                        commands
                      </span>
                    </div>
                    <div className="sequence-strip">
                      {plan?.blocks.map((block, i) => (
                        <button
                          key={`${block.objectId}-${i}`}
                          title={`${project.objects.find((o) => o.id === block.objectId)?.name} · ${block.stitchCount.toLocaleString()} stitches`}
                          aria-label={`Inspect stitch block ${i + 1}`}
                          style={{
                            background: block.color,
                            flex: block.stitchCount,
                          }}
                          onClick={() => {
                            setSelected([block.objectId]);
                            setProgress(
                              (block.end / plan.stitches.length) * 100,
                            );
                            setView("stitches");
                            setPlaying(false);
                          }}
                        />
                      ))}
                    </div>
                    <Slider
                      aria-label="Stitch playback progress"
                      value={[progress]}
                      onValueChange={(value) => {
                        setProgress(value[0]);
                        setPlaying(false);
                      }}
                      min={0}
                      max={100}
                      step={0.1}
                      disabled={!plan?.stitchCount}
                    />
                  </div>
                  {inspectStitches && (
                    <StitchInspector
                      onSelect={(id) => {
                        setSelected([id]);
                        setViewRequest((v) => ({
                          id: (v?.id ?? 0) + 1,
                          mode: "selection",
                        }));
                      }}
                      project={project}
                      plan={plan}
                      progress={progress}
                      onSeek={(v) => {
                        setProgress(v);
                        setPlaying(false);
                        setView("stitches");
                      }}
                    />
                  )}
                </div>
                <Inspector
                  project={project}
                  selected={selected}
                  onChange={changeObjects}
                  onProject={safeCommit}
                />
              </main>
            </>
          )}
          <div className="workspace-page" hidden={workspace !== "convert"}>
            {state.namespace && (
              <Converter
                key={state.namespace}
                namespace={state.namespace}
                originalProject={project}
                incoming={
                  incoming?.namespace === state.namespace ? incoming.file : null
                }
                onApply={replaceProject}
              />
            )}
          </div>
          {workspace === "optimize" && (
            <Optimizer
              project={project}
              plan={plan}
              onApply={(next) => {
                safeCommit(next);
                setSelected([]);
                setWorkspace("studio");
                setView("stitches");
              }}
            />
          )}
          {workspace === "analysis" && (
            <Analysis
              project={project}
              plan={plan}
              onSelect={select}
              onChange={safeCommit}
            />
          )}
          {workspace === "inspiration" && (
            <Inspiration
              onPalette={(next) => {
                setReferencePalette(next);
                setWorkspace("studio");
                toast.success(
                  "Reference palette added beside your design colours. Select an object and choose a swatch.",
                );
              }}
            />
          )}
          {workspace === "production" && (
            <Production
              project={project}
              plan={plan}
              busy={busy}
              onChange={safeCommit}
              onSelect={select}
              onExport={() => setExportOpen(true)}
            />
          )}
          <footer className="statusbar">
            <span className="status-item">
              <Route size={13} />
              <strong>{plan?.stitchCount.toLocaleString() ?? "—"}</strong>{" "}
              stitches
            </span>
            <span className="status-item">
              <Palette size={13} />
              <strong>{colors.length}</strong> colours
            </span>
            <span className="status-item">
              <Scissors size={13} />
              <strong>{plan?.trimCount ?? "—"}</strong> trims
            </span>
            <span className="status-item">
              <Ruler size={13} />
              {measure.size(project.width, project.height)}
            </span>
            <button
              className={`status-checks ${machineErrors.length ? "has-errors" : ""}`}
              onClick={() => setWorkspace("production")}
            >
              <AlertTriangle size={13} />
              {plan?.issues.length ?? 0} design checks
            </button>
            <span className="status-right">DSYN HOUSE · THREADFORM</span>
          </footer>
          {quickOpen && (
            <QuickGuide
              open={quickOpen}
              onOpenChange={setQuickOpen}
              onWorkspace={guideWorkspace}
            />
          )}
          {autoOpen && (
            <AutoDigitizeDialog
              open={autoOpen}
              onOpenChange={setAutoOpen}
              project={project}
              selected={selected}
              onApply={(p) => {
                safeCommit(p);
                setView("stitches");
                setSelected([]);
                setWorkspace("studio");
              }}
            />
          )}
          {crossOpen && (
            <CrossChart
              open={crossOpen}
              onOpenChange={setCrossOpen}
              project={project}
              onAdd={(objects) => {
                safeCommit({
                  ...project,
                  objects: [...project.objects, ...objects],
                });
                setSelected(objects.map((o) => o.id));
                setWorkspace("studio");
              }}
            />
          )}
          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Zoom factor</DialogTitle>
                <DialogDescription>
                  1 = 100% at 96 CSS pixels per inch. For physical sizing, print
                  a 1:1 PDF template.
                </DialogDescription>
              </DialogHeader>
              <NumberField
                label="Zoom factor"
                value={zoomFactor}
                min={0.01}
                max={30}
                unit="×"
                onChange={setZoomFactor}
              />
              <button
                className="button primary"
                onClick={() => {
                  setViewRequest({
                    id: Date.now(),
                    mode: "factor",
                    factor: zoomFactor,
                  });
                  setZoomOpen(false);
                }}
              >
                Apply zoom
              </button>
            </DialogContent>
          </Dialog>
          <MotifBrowser
            open={motifsOpen}
            onOpenChange={setMotifsOpen}
            project={project}
            color={activeColor}
            onAdd={addObject}
            onPalette={(colors) => {
              setReferencePalette(colors);
              setActiveColor(colors[0]);
              toast.success("Colour study added to your thread palette.");
            }}
          />
          <PatternLab
            open={patternOpen}
            onOpenChange={setPatternOpen}
            project={project}
            objects={unlocked}
            onApply={(objects) => {
              const ids = unlocked.map((o) => o.id),
                next = [
                  ...project.objects.filter((o) => !ids.includes(o.id)),
                  ...objects,
                ];
              safeCommit({ ...project, objects: next });
              setSelected(objects.map((o) => o.id));
              setWorkspace("studio");
            }}
          />
          <ShapeLab
            key={`${shapeOpen}-${shapeAction}`}
            open={shapeOpen}
            onOpenChange={setShapeOpen}
            project={project}
            selected={selected}
            initialAction={shapeAction}
            onApply={(next) => {
              safeCommit(next);
              setSelected([]);
              setWorkspace("studio");
            }}
          />
          <Dialog open={commandsOpen} onOpenChange={setCommandsOpen}>
            <DialogContent className="command-dialog">
              <DialogHeader>
                <DialogTitle>Find your next tool</DialogTitle>
                <DialogDescription>
                  Search tools and actions. Use arrow keys to choose and Enter
                  to run.
                </DialogDescription>
              </DialogHeader>
              <Command>
                <CommandInput placeholder="Try knife, optimize, offset or lettering…" />
                <CommandList>
                  <CommandEmpty>No matching tools.</CommandEmpty>
                  <CommandGroup heading="Drawing & editing">
                    {toolInfo.map((t) => (
                      <CommandItem
                        key={t.id}
                        value={t.label}
                        onSelect={() => {
                          setCommandsOpen(false);
                          setTool(t.id);
                          setWorkspace("studio");
                        }}
                      >
                        {t.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Commands & Wilcom-style keys">
                    {SHORTCUTS.filter(
                      (c, i, a) => a.findIndex((d) => d.id === c.id) === i,
                    ).map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.label} ${c.display}`}
                        onSelect={() => {
                          setCommandsOpen(false);
                          action(c.id);
                        }}
                      >
                        {c.label}
                        <kbd className="command-key">{c.display}</kbd>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Creative workshops">
                    {[
                      { id: "cross-chart", label: "Cross-stitch chart" },
                      {
                        id: "stitch-library",
                        label: "Stitch methods & effects",
                      },
                      { id: "shape-lab", label: "Shape & cutting workshop" },
                      { id: "threads", label: "Thread directory" },
                      { id: "auto", label: "Auto-digitize preview" },
                      { id: "optimize", label: "Optimize colours & sequence" },
                      { id: "quick-guide", label: "Quick start guide" },
                    ].map((c) => (
                      <CommandItem
                        key={c.id}
                        onSelect={() => {
                          setCommandsOpen(false);
                          action(c.id);
                        }}
                      >
                        {c.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </DialogContent>
          </Dialog>
          <ProjectBrowser
            open={projectsOpen}
            onOpenChange={setProjectsOpen}
            onLoad={replaceProject}
            onNew={() => replaceProject(emptyProject())}
          />
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bring an idea into the studio</DialogTitle>
                <DialogDescription>
                  Import artwork, open an editable project or explore a stitch
                  study.
                </DialogDescription>
              </DialogHeader>
              <button
                className="import-zone"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={26} style={{ margin: "auto" }} />
                <strong>Choose artwork or a project</strong>
                <small>
                  SVG · PNG · JPG · WebP · Threadform JSON · up to 32 MB
                </small>
              </button>
              <div className="sample-grid">
                <button
                  className="sample-button"
                  onClick={() => replaceProject(createSample())}
                >
                  <Spline size={28} />
                  <strong>Arc study</strong>
                  <small>Layered satin & tatami</small>
                </button>
                <button
                  className="sample-button"
                  onClick={() => replaceProject(createSample("sampler"))}
                >
                  <Grid2X2 size={28} />
                  <strong>Stitch sampler</strong>
                  <small>Direction, spacing & texture</small>
                </button>
              </div>
              <button
                className="button"
                onClick={() => replaceProject(emptyProject())}
              >
                <Plus size={15} />
                Blank canvas
              </button>
              <p className="help-text">
                Bitmap tracing creates editable vector contours. Flatten
                gradients and outline text in SVG files for predictable import.
              </p>
            </DialogContent>
          </Dialog>
          {threadsOpen && (
            <ThreadDirectory
              open={threadsOpen}
              onOpenChange={setThreadsOpen}
              project={project}
              selected={selected}
              onProject={safeCommit}
            />
          )}
          {approvalOpen && (
            <ApprovalSheets
              open={approvalOpen}
              onOpenChange={setApprovalOpen}
              project={project}
              plan={plan}
              onProject={safeCommit}
            />
          )}
          {stitchLibraryOpen && (
            <StitchLibrary
              open={stitchLibraryOpen}
              onOpenChange={setStitchLibraryOpen}
              hasSelection={!!unlocked.length}
              onApply={applyMethod}
            />
          )}
          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogContent className="export-dialog">
              <DialogHeader>
                <DialogTitle>Export your embroidery</DialogTitle>
                <DialogDescription>
                  Preview and machine export use the same generated stitch plan.
                </DialogDescription>
              </DialogHeader>
              <div className="export-summary">
                <strong>
                  {plan?.stitchCount.toLocaleString() ?? 0} stitches
                </strong>
                <span>
                  {colors.length} thread colours ·{" "}
                  {project.workspaceMode === "freeform"
                    ? "Freeform design"
                    : `${measure.size(project.hoopWidth, project.hoopHeight)} hoop`}
                </span>
              </div>
              <MachineControls project={project} onProject={safeCommit} />
              <button
                className="format-option"
                onClick={() => {
                  setExportOpen(false);
                  setApprovalOpen(true);
                }}
              >
                <Download size={22} />
                <span>
                  <strong>Approval sheets & actual-size templates · PDF</strong>
                  <small>
                    Print preview, thread sequence and client approval.
                  </small>
                </span>
              </button>
              {machineErrors.map((issue, i) => (
                <div className="issue error" key={i}>
                  {issue.message}
                </div>
              ))}
              <div className="format-grid">
                {(
                  [
                    ["dst", "Tajima DST"],
                    ["pes", "Brother PES v1"],
                    ["jef", "Janome JEF"],
                    ["exp", "Melco / Bernina EXP"],
                  ] as const
                ).map(([format, label]) => (
                  <button
                    className="format-option"
                    key={format}
                    onClick={() => void exportMachine(format)}
                    disabled={
                      busy || !plan?.stitchCount || machineErrors.length > 0
                    }
                  >
                    <Download size={21} />
                    <span>
                      <strong>{label}</strong>
                      <small>
                        Native file + project, thread order & SHA-256
                      </small>
                    </span>
                  </button>
                ))}
              </div>
              <button
                className="format-option"
                onClick={() => {
                  try {
                    download(
                      exportObjectExchange(project, busy ? null : plan),
                      fileName(project.name) + "-wilcom-handoff.zip",
                      "application/zip",
                    );
                  } catch (error) {
                    toast.error(errorMessage(error));
                  }
                }}
              >
                <Download size={21} />
                <span>
                  <strong>Wilcom handoff · SVG + object settings</strong>
                  <small>
                    Preserves the editable master and underlay order. Native EMB
                    conversion requires a licensed Wilcom integration.
                  </small>
                </span>
              </button>
              <details className="help-text">
                <summary>Opening fills in Wilcom</summary>
                <p>
                  Extract the package and open its DST, PES, JEF or EXP file.
                  SVG contains the vector artwork. For a stitch-preserving
                  comparison, turn off Objects/Outlines and Automatic Connectors
                  in Wilcom’s Open options. Set DST trim recognition to 3
                  consecutive jumps.
                </p>
                <p>
                  For editable tatami, enable Objects/Outlines on a separate
                  copy and review Tatami recognition’s spacing and length
                  ranges. Recognition reconstructs objects; it may divide a fill
                  into several objects. Keep the Threadform project to
                  regenerate the original settings.
                </p>
                <a
                  href="https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Production/convert/Open_machine_files.htm"
                  target="_blank"
                  rel="noreferrer"
                >
                  Wilcom’s machine-file guide
                </a>
              </details>
              <button
                className="format-option"
                onClick={() =>
                  download(
                    exportSVG(project),
                    fileName(project.name) + ".svg",
                    "image/svg+xml",
                  )
                }
              >
                <Shapes size={22} />
                <span>
                  <strong>Editable vector artwork · SVG</strong>
                  <small>
                    Preserve shapes and colours for another design tool.
                  </small>
                </span>
              </button>
              <button className="format-option" onClick={downloadProject}>
                <Save size={22} />
                <span>
                  <strong>Threadform project · JSON</strong>
                  <small>
                    Objects, stitch parameters, notes and sew-out records.
                  </small>
                </span>
              </button>
              <p className="help-text">
                DST stores machine movements, not RGB colours. Use the
                thread-order file. Trim behaviour varies by machine; test on
                your intended machine, fabric and stabilizer. PES and JEF use
                format palettes; exact thread assignments remain in the package.
                Native EMB editing is not included.
              </p>
            </DialogContent>
          </Dialog>
          <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
            <DialogContent className="guide-dialog">
              <DialogHeader>
                <DialogTitle>Your studio, from idea to stitch</DialogTitle>
                <DialogDescription>
                  A practical guide to the tools in this release.
                </DialogDescription>
              </DialogHeader>
              <ShortcutReference
                onQuickGuide={() => {
                  setHelpOpen(false);
                  setQuickOpen(true);
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={letteringOpen} onOpenChange={setLetteringOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Single-line lettering</DialogTitle>
                <DialogDescription>
                  Add editable strokes with a triple running stitch. Import
                  outlined SVG for other typefaces.
                </DialogDescription>
              </DialogHeader>
              <label className="form-field">
                Text
                <input
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                />
              </label>
              <NumberField
                label="Letter height"
                value={letterHeight}
                min={0.1}
                max={null}
                onChange={setLetterHeight}
              />
              <p className="help-text">
                Original monoline alphabet: A–Z, 0–9, spaces, hyphens and
                periods. Each letter becomes an editable object in a group.
              </p>
              <button
                className="button primary"
                disabled={!letterText.trim()}
                onClick={() => {
                  try {
                    const letters = createLettering(
                      letterText,
                      letterHeight,
                      { x: 10, y: project.height / 2 - letterHeight / 2 },
                      activeColor,
                      createId(),
                    );
                    safeCommit({
                      ...project,
                      objects: [...project.objects, ...letters],
                    });
                    setSelected(letters.map((o) => o.id));
                    setLetteringOpen(false);
                    setWorkspace("studio");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <Type size={16} />
                Add lettering
              </button>
            </DialogContent>
          </Dialog>
          <Dialog
            open={!!pending}
            onOpenChange={(open) => {
              if (!open) setPending(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Keep your current work</DialogTitle>
                <DialogDescription>
                  You have unsaved changes in {project.name}. Save or download
                  them before opening {pending?.project.name}.
                </DialogDescription>
              </DialogHeader>
              <button
                className="button primary"
                disabled={state.saving}
                onClick={async () => {
                  const target = pending;
                  if (target && (await save()))
                    openNow(target.project, target.cloud);
                }}
              >
                Save and open
              </button>
              <button
                className="button"
                onClick={() => {
                  if (pending) {
                    downloadProject();
                    openNow(pending.project, pending.cloud);
                  }
                }}
              >
                Download a copy and open
              </button>
              <button className="text-button" onClick={() => setPending(null)}>
                Keep editing this design
              </button>
            </DialogContent>
          </Dialog>
          <Toaster position="bottom-center" richColors />
        </div>
      </TooltipProvider>
    </MeasurementProvider>
  );
}
