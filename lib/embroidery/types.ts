export type Point = {
  x: number;
  y: number;
  curve?: boolean;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
};
export type StitchType =
  | "raised-satin"
  | "island-coil"
  | "square-fill"
  | "double-square"
  | "half-cross"
  | "quarter-cross"
  | "petite-cross"
  | "double"
  | "stem"
  | "chain"
  | "candlewick"
  | "coil-run"
  | "motif-run"
  | "column-c"
  | "program-split"
  | "spiral"
  | "ripple"
  | "meander"
  | "coil-fill"
  | "contour"
  | "tatami"
  | "satin"
  | "satin-column"
  | "run"
  | "triple"
  | "back"
  | "zigzag"
  | "blanket"
  | "cross"
  | "motif"
  | "wave"
  | "manual"
  | "none";
export type UnderlayKind = "fill" | "cross" | "edge" | "center" | "zigzag";
export type UnderlayLayer = {
  id: string;
  kind: "center" | "edge" | "zigzag" | "double-zigzag" | "tatami";
  enabled: boolean;
  spacing: number;
  length: number;
  inset: number;
  /** Angle relative to the cover stitch direction, in degrees. */
  angle: number;
};
export const STITCH_NAMES: Record<StitchType, string> = {
  "raised-satin": "Raised satin",
  "island-coil": "Island coil fill",
  "square-fill": "Square fill",
  "double-square": "Double square fill",
  "half-cross": "Half cross",
  "quarter-cross": "Quarter cross",
  "petite-cross": "Petite cross",
  double: "Double run",
  stem: "Stem run",
  chain: "Chain effect run",
  candlewick: "Candlewick effect run",
  "coil-run": "Coil run",
  "motif-run": "Motif run",
  "column-c": "Column C · centreline satin",
  "program-split": "Program split fill",
  spiral: "Spiral fill",
  ripple: "Ripple fill",
  meander: "Meander fill",
  "coil-fill": "Coil fill",
  contour: "Contour fill",
  tatami: "Tatami fill",
  satin: "Parallel satin",
  "satin-column": "Column A / B · turning satin",
  run: "Running stitch",
  triple: "Triple / bean run",
  back: "Backstitch",
  zigzag: "Zigzag run",
  blanket: "Blanket / E-stitch",
  cross: "Cross-stitch fill",
  motif: "Motif fill",
  wave: "Wave fill",
  manual: "Manual needle points",
  none: "Artwork only",
};
export const LINE_TYPES: StitchType[] = [
  "double",
  "stem",
  "chain",
  "candlewick",
  "coil-run",
  "motif-run",
  "column-c",
  "run",
  "triple",
  "back",
  "zigzag",
  "blanket",
  "manual",
];
export type Fabric = "linen" | "cotton" | "knit" | "silk";
export type EmbroideryObject = {
  id: string;
  name: string;
  color: string;
  paths: Point[][];
  closed: boolean[];
  fillRule: "evenodd" | "nonzero";
  type: StitchType;
  angle: number;
  spacing: number;
  length: number;
  underlay: boolean;
  pull: number;
  visible: boolean;
  /** View visibility is independent of production inclusion. */
  sewEnabled?: boolean;
  artworkRole?: "embroidery" | "print" | "fabric" | "reference";
  columnKind?: "A" | "B" | "C";
  keepLastStitch?: boolean;
  columnOffset?: number;
  locked: boolean;
  entryPoint?: Point;
  exitPoint?: Point;
  pauseAfter?: boolean;
  sequinMode?: boolean;
  satinLayers?: number;
  crossSize?: number;
  crossOrder?: "english" | "danish";
  crossTop?: "slash" | "backslash";
  crossRepeats?: number;
  underlayKind?: UnderlayKind;
  underlays?: UnderlayLayer[];
  satinMaxLength?: number;
  patternSize?: number;
  motif?: "diamond" | "chevron" | "star";
  underlayInset?: number;
  tatamiOffset?: number;
  tatamiMinStitch?: number;
  spacingEnd?: number;
  colorLocked?: boolean;
  directionLocked?: boolean;
  forceTrim?: boolean;
  lineWidth?: number;
  tieIn?: boolean;
  tieOut?: boolean;
  groupId?: string;
  splitPattern?:
    | "brick"
    | "diamond"
    | "chevron"
    | "wave"
    | "basket"
    | "scales"
    | "custom";
  customPattern?: Point[][];
  edgeEffect?: "none" | "feather" | "jagged";
  effectDepth?: number;
  repeatCount?: number;
  connector?: "auto" | "jump" | "trim";
  thread?: ThreadShade;
};
export type ThreadShade = {
  brand: string;
  line: string;
  code: string;
  name: string;
  color: string;
  source?: string;
  measuredLab?: [number, number, number];
  illuminant?: "D50" | "D65";
  observer?: "2" | "10";
  measuredAt?: string;
  instrument?: string;
  lot?: string;
};
export type MachineSettings = {
  name: string;
  fieldWidth: number;
  fieldHeight: number;
  fieldCheck: boolean;
  maxStitches: number;
  maxColors: number;
  specialty?: "lockstitch" | "tajima-single-sequin";
};
export type SewOut = {
  id: string;
  date: string;
  machine: string;
  fabric: string;
  stabilizer: string;
  thread: string;
  needle: string;
  speed: number;
  result: "pending" | "revise" | "passed";
  notes: string;
  designFingerprint: string;
  format?: "dst" | "pes" | "jef" | "exp";
  fileSha256?: string;
  firmware?: string;
  operator?: string;
  evidenceURL?: string;
  controllerAccepted?: boolean;
  measuredWidth?: number;
  measuredHeight?: number;
  threadBreaks?: number;
};
export type ArtworkLayer = {
  assetId: string;
  name: string;
  /** Affine transform from a unit image rectangle to millimetre coordinates. */
  transform: [number, number, number, number, number, number];
  visible: boolean;
  dimmed: boolean;
  opacity: number;
  locked: boolean;
  cloudReady?: boolean;
};
export type Project = {
  artworkLayer?: ArtworkLayer;
  artwork?: {
    id: string;
    name: string;
    options?: import("./trace-options").TraceOptions;
  };
  editorState?: EditorState;
  units?: "mm" | "in";
  version: 1;
  name: string;
  width: number;
  height: number;
  fabric: Fabric;
  hoopWidth: number;
  hoopHeight: number;
  objects: EmbroideryObject[];
  notes: string[];
  source: "sample" | "svg" | "raster" | "manual";
  sewOuts?: SewOut[];
  trimDistance?: number;
  workspaceMode?: "freeform" | "hoop";
  autoStart?: "center" | "first" | "custom";
  autoEnd?: "last" | "start" | "custom";
  startPoint?: Point;
  endPoint?: Point;
  machine?: MachineSettings;
  threadLibrary?: ThreadShade[];
  approval?: {
    client: string;
    reference: string;
    preparedBy: string;
    notes: string;
  };
};
export type EditorState = {
  workspace: string;
  view: string;
  selected: string[];
  zoom: number;
  grid: boolean;
  snap: boolean;
  jumps: boolean;
  progress: number;
};
export type Stitch = Point & {
  command: "stitch" | "jump" | "color" | "trim";
  objectId: string;
  color: string;
  underlay?: boolean;
  underlayLayer?: string;
};
export type Issue = {
  level: "warning" | "error";
  message: string;
  objectId?: string;
};
export type StitchBlock = {
  objectId: string;
  color: string;
  start: number;
  end: number;
  stitchCount: number;
};
export type StitchPlan = {
  stitches: Stitch[];
  blocks: StitchBlock[];
  issues: Issue[];
  stitchCount: number;
  jumpCount: number;
  jumpMM: number;
  trimCount: number;
  colorChanges: number;
  threadMM: number;
  estimatedMinutes: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};
export const FABRICS: Record<
  Fabric,
  { label: string; color: string; spacing: number; pull: number }
> = {
  linen: { label: "Linen", color: "#f8f6ef", spacing: 0.42, pull: 0.2 },
  cotton: { label: "Cotton", color: "#fcfcfb", spacing: 0.4, pull: 0.2 },
  knit: { label: "Jersey knit", color: "#e9edf2", spacing: 0.45, pull: 0.35 },
  silk: { label: "Silk", color: "#f5efed", spacing: 0.45, pull: 0.15 },
};
export function makeObject(
  partial: Partial<EmbroideryObject> &
    Pick<EmbroideryObject, "id" | "name" | "paths">,
): EmbroideryObject {
  return {
    color: "#21776a",
    closed: partial.paths.map(() => true),
    fillRule: "evenodd",
    type: "tatami",
    angle: 45,
    spacing: 0.42,
    length: 3,
    underlay: true,
    pull: 0.2,
    visible: true,
    sewEnabled: partial.sewEnabled ?? partial.visible !== false,
    locked: false,
    ...partial,
  };
}
