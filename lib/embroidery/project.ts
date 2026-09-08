import { validateUnderlays } from "./underlay-settings";
import {
  makeObject,
  STITCH_NAMES,
  type EmbroideryObject,
  type Project,
  type Point,
  type ThreadShade,
} from "./types";
import { transformObject } from "./operations";
import { validateArtworkLayer, resizeArtworkLayer } from "./artwork-layer";
import { GEOMETRY_BUDGET } from "./complexity";
import { validateTraceOptions } from "./trace-options";
export function validateThread(raw: unknown): ThreadShade {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid thread record.");
  const r = raw as Record<string, unknown>;
  if (!/^#[0-9a-f]{6}$/i.test(String(r.color)))
    throw new Error("Thread colours must use six-digit hex values.");
  const extra: Partial<ThreadShade> = {};
  for (const key of ["source", "measuredAt", "instrument", "lot"] as const)
    if (r[key] !== undefined) {
      if (typeof r[key] !== "string" || r[key].length > 500)
        throw new Error("Invalid thread provenance.");
      extra[key] = r[key];
    }
  if (r.measuredLab !== undefined) {
    const lab = r.measuredLab;
    if (
      !Array.isArray(lab) ||
      lab.length !== 3 ||
      !lab.every((v) => typeof v === "number" && Number.isFinite(v)) ||
      lab[0] < 0 ||
      lab[0] > 100 ||
      Math.abs(lab[1]) > 160 ||
      Math.abs(lab[2]) > 160
    )
      throw new Error("Invalid measured CIELAB values.");
    if (
      !["D50", "D65"].includes(String(r.illuminant)) ||
      !["2", "10"].includes(String(r.observer)) ||
      !extra.measuredAt ||
      !extra.instrument ||
      !extra.source
    )
      throw new Error(
        "Measured shades require source, instrument, date, illuminant and observer.",
      );
    extra.measuredLab = lab as [number, number, number];
    extra.illuminant = r.illuminant as "D50" | "D65";
    extra.observer = r.observer as "2" | "10";
  }
  return {
    ...extra,
    brand: String(r.brand ?? "Custom").slice(0, 100),
    line: String(r.line ?? "").slice(0, 100),
    code: String(r.code ?? "").slice(0, 100),
    name: String(r.name ?? "").slice(0, 100),
    color: String(r.color).toLowerCase(),
  };
}
export function validateProject(data: unknown): Project {
  if (!data || typeof data !== "object")
    throw new Error("Invalid Threadform project.");
  const p = data as Record<string, unknown>;
  const finite = (x: unknown, min = -Infinity, max = Infinity) =>
    typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
  if (
    p.version !== 1 ||
    !Array.isArray(p.objects) ||
    !finite(p.width, 1) ||
    !finite(p.height, 1) ||
    !finite(p.hoopWidth, 1) ||
    !finite(p.hoopHeight, 1)
  )
    throw new Error(
      "Project version, dimensions or object count is unsupported.",
    );
  let points = 0;
  const ids = new Set<string>();
  const objects = p.objects.map((raw: Record<string, unknown>, i: number) => {
    if (
      !raw ||
      !Array.isArray(raw.paths) ||
      !Array.isArray(raw.closed) ||
      raw.closed.length !== raw.paths.length
    )
      throw new Error("Invalid project contours.");
    points += 8 + raw.paths.length;
    if (points > GEOMETRY_BUDGET)
      throw new Error("Project exceeds the vector processing budget.");
    const paths = raw.paths.map((path: unknown) => {
      if (!Array.isArray(path)) throw new Error("Invalid project path.");
      points += path.length;
      if (points > GEOMETRY_BUDGET)
        throw new Error("Project exceeds the vector processing budget.");
      return path.map((pt: Point) => {
        if (!pt || !finite(pt.x) || !finite(pt.y))
          throw new Error("Invalid project coordinates.");
        const handles: Partial<Point> = {};
        for (const field of ["handleIn", "handleOut"] as const) {
          const h = pt[field];
          if (h !== undefined) {
            if (!h || !finite(h.x) || !finite(h.y))
              throw new Error("Invalid Bezier control point.");
            handles[field] = { x: h.x, y: h.y };
          }
        }
        return {
          x: pt.x,
          y: pt.y,
          ...(pt.curve ? { curve: true } : {}),
          ...handles,
        };
      });
    });
    if (
      !finite(raw.spacing, 0.2, 2) ||
      !finite(raw.length, 0.4, 7) ||
      !finite(raw.pull, 0, 0.8) ||
      !finite(raw.angle, 0, 180) ||
      !Object.hasOwn(STITCH_NAMES, String(raw.type)) ||
      !/^#[0-9a-f]{6}$/i.test(String(raw.color))
    )
      throw new Error("Invalid stitch settings in project.");
    const id =
      typeof raw.id === "string" ? raw.id.slice(0, 100) : `object-${i}`;
    if (ids.has(id)) throw new Error("Project contains duplicate object IDs.");
    ids.add(id);
    if (
      raw.type === "satin-column" &&
      (paths.length !== 2 ||
        paths[0].length < 2 ||
        paths[1].length < 2 ||
        (raw.columnKind !== "B" && paths[0].length !== paths[1].length))
    )
      throw new Error("Invalid paired satin rails.");
    const optional: Partial<EmbroideryObject> = {};
    if (raw.columnKind !== undefined) {
      if (!["A", "B", "C"].includes(String(raw.columnKind)))
        throw new Error("Invalid column input method.");
      optional.columnKind = raw.columnKind as EmbroideryObject["columnKind"];
    }
    if (typeof raw.keepLastStitch === "boolean")
      optional.keepLastStitch = raw.keepLastStitch;
    if (raw.columnOffset !== undefined) {
      if (!finite(raw.columnOffset)) throw new Error("Invalid column offset.");
      optional.columnOffset = raw.columnOffset as number;
    }
    for (const key of ["entryPoint", "exitPoint"] as const)
      if (raw[key] !== undefined) {
        const point = raw[key] as Point;
        if (!point || !finite(point.x) || !finite(point.y))
          throw new Error("Invalid object entry/exit point.");
        optional[key] = { x: point.x, y: point.y };
      }
    if (raw.underlays !== undefined)
      optional.underlays = validateUnderlays(raw.underlays);
    if (raw.underlayKind !== undefined) {
      if (
        !["fill", "cross", "edge", "center", "zigzag"].includes(
          String(raw.underlayKind),
        )
      )
        throw new Error("Invalid underlay method.");
      optional.underlayKind =
        raw.underlayKind as EmbroideryObject["underlayKind"];
    }
    for (const [key, min, max] of [
      ["patternSize", 1.5, Infinity],
      ["satinLayers", 2, 5],
      ["satinMaxLength", 1, 12.1],
      ["crossSize", 0.5, 10],
      ["crossRepeats", 1, 3],
      ["lineWidth", 0.5, Infinity],
      ["underlayInset", 0, 3],
      ["tatamiOffset", 0, 1],
      ["tatamiMinStitch", 0.1, 1.5],
      ["spacingEnd", 0.2, 2],
      ["effectDepth", 0, 3],
      ["repeatCount", 1, 5],
    ] as const) {
      if (raw[key] !== undefined) {
        if (!finite(raw[key], min, max))
          throw new Error("Invalid pattern dimensions.");
        if (
          ["satinLayers", "crossRepeats", "repeatCount"].includes(key) &&
          !Number.isInteger(raw[key])
        )
          throw new Error("Stitch repeat counts must be whole numbers.");
        optional[key] = raw[key] as number;
      }
    }
    if (raw.motif !== undefined) {
      if (!["diamond", "chevron", "star"].includes(String(raw.motif)))
        throw new Error("Invalid motif.");
      optional.motif = raw.motif as EmbroideryObject["motif"];
    }
    for (const [key, values] of [
      [
        "splitPattern",
        ["brick", "diamond", "chevron", "wave", "basket", "scales", "custom"],
      ],
      ["edgeEffect", ["none", "feather", "jagged"]],
      ["crossOrder", ["english", "danish"]],
      ["crossTop", ["slash", "backslash"]],
      ["connector", ["auto", "jump", "trim"]],
    ] as const) {
      if (raw[key] !== undefined) {
        if (!(values as readonly string[]).includes(String(raw[key])))
          throw new Error("Invalid stitch effect.");
        Object.assign(optional, { [key]: raw[key] });
      }
    }
    if (raw.customPattern !== undefined) {
      if (!Array.isArray(raw.customPattern) || raw.customPattern.length > 16)
        throw new Error("Use at most 16 paths in a pattern tile.");
      let count = 0;
      optional.customPattern = raw.customPattern.map((path: unknown) => {
        if (!Array.isArray(path) || path.length < 2)
          throw new Error("Pattern paths need at least two points.");
        count += path.length;
        if (count > 500) throw new Error("Pattern tile exceeds 500 points.");
        return path.map((pt: Point) => {
          if (!pt || !finite(pt.x, 0, 1) || !finite(pt.y, 0, 1))
            throw new Error("Pattern coordinates must be between 0 and 1.");
          return { x: pt.x, y: pt.y };
        });
      });
    }
    if (raw.thread !== undefined) optional.thread = validateThread(raw.thread);
    for (const key of [
      "colorLocked",
      "directionLocked",
      "forceTrim",
      "pauseAfter",
      "sequinMode",
    ] as const) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== "boolean")
          throw new Error("Invalid stitch lock.");
        optional[key] = raw[key] as boolean;
      }
    }
    if (raw.tieIn !== undefined) optional.tieIn = raw.tieIn !== false;
    if (raw.tieOut !== undefined) optional.tieOut = raw.tieOut !== false;
    if (typeof raw.groupId === "string")
      optional.groupId = raw.groupId.slice(0, 100);
    return makeObject({
      ...optional,
      id,
      name: String(raw.name ?? `Object ${i + 1}`).slice(0, 100),
      color: String(raw.color),
      paths,
      closed: raw.closed.map(Boolean),
      fillRule: raw.fillRule === "nonzero" ? "nonzero" : "evenodd",
      type: raw.type as EmbroideryObject["type"],
      angle: raw.angle as number,
      spacing: raw.spacing as number,
      length: raw.length as number,
      underlay: !!raw.underlay,
      pull: raw.pull as number,
      visible: raw.visible !== false,
      sewEnabled:
        typeof raw.sewEnabled === "boolean"
          ? raw.sewEnabled
          : raw.visible !== false,
      ...(["embroidery", "print", "fabric", "reference"].includes(
        String(raw.artworkRole),
      )
        ? { artworkRole: raw.artworkRole as EmbroideryObject["artworkRole"] }
        : {}),
      locked: !!raw.locked,
    });
  });
  if (p.trimDistance !== undefined && !finite(p.trimDistance, 0, 5))
    throw new Error("Invalid untrimmed jump limit.");
  const sewOuts =
    p.sewOuts === undefined ? undefined : validateSewOuts(p.sewOuts);
  const extra: Partial<Project> = {};
  if (p.artworkLayer !== undefined)
    extra.artworkLayer = validateArtworkLayer(p.artworkLayer);
  if (p.artwork !== undefined) {
    const a = p.artwork as Record<string, unknown>;
    if (
      !a ||
      typeof a !== "object" ||
      typeof a.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        a.id,
      ) ||
      typeof a.name !== "string" ||
      a.name.length > 255
    )
      throw new Error("Invalid original artwork reference.");
    extra.artwork = {
      id: a.id,
      name: a.name,
      ...(a.options ? { options: validateTraceOptions(a.options) } : {}),
    };
  }
  if (p.editorState && typeof p.editorState === "object") {
    const e = p.editorState as Record<string, unknown>;
    extra.editorState = {
      workspace: [
        "studio",
        "convert",
        "optimize",
        "analysis",
        "inspiration",
        "production",
      ].includes(String(e.workspace))
        ? String(e.workspace)
        : "studio",
      view: ["stitches", "artwork", "density"].includes(String(e.view))
        ? String(e.view)
        : "stitches",
      selected: Array.isArray(e.selected)
        ? e.selected.filter(
            (id): id is string => typeof id === "string" && ids.has(id),
          )
        : [],
      zoom: finite(e.zoom, 0.00001, 1000) ? (e.zoom as number) : 1,
      grid: e.grid === true,
      snap: e.snap === true,
      jumps: e.jumps === true,
      progress: finite(e.progress, 0, 100) ? (e.progress as number) : 100,
    };
  }
  if (p.units !== undefined) {
    if (p.units !== "mm" && p.units !== "in")
      throw new Error("Invalid measurement units.");
    extra.units = p.units;
  }
  for (const [key, values] of [
    ["workspaceMode", ["freeform", "hoop"]],
    ["autoStart", ["center", "first", "custom"]],
    ["autoEnd", ["last", "start", "custom"]],
  ] as const)
    if (p[key] !== undefined) {
      if (!(values as readonly string[]).includes(String(p[key])))
        throw new Error("Invalid workspace or start/end mode.");
      Object.assign(extra, { [key]: p[key] });
    }
  for (const key of ["startPoint", "endPoint"] as const)
    if (p[key] !== undefined) {
      const point = p[key] as Point;
      if (!point || !finite(point.x) || !finite(point.y))
        throw new Error("Invalid start or end coordinates.");
      extra[key] = { x: point.x, y: point.y };
    }
  if (
    (p.autoStart === "custom" && !extra.startPoint) ||
    (p.autoEnd === "custom" && !extra.endPoint)
  )
    throw new Error("Custom start/end needs coordinates.");
  if (p.threadLibrary !== undefined) {
    if (!Array.isArray(p.threadLibrary))
      throw new Error("A thread library can contain up to 5,000 shades.");
    extra.threadLibrary = p.threadLibrary.map(validateThread);
  }
  if (p.machine !== undefined) {
    const m = p.machine as Record<string, unknown>;
    if (
      !m ||
      !finite(m.fieldWidth, 1) ||
      !finite(m.fieldHeight, 1) ||
      !finite(m.maxStitches, 1, 10000000) ||
      !finite(m.maxColors, 1, 10000) ||
      typeof m.fieldCheck !== "boolean"
    )
      throw new Error("Invalid machine profile.");
    extra.machine = {
      name: String(m.name ?? "Custom machine").slice(0, 100),
      fieldWidth: m.fieldWidth as number,
      fieldHeight: m.fieldHeight as number,
      fieldCheck: m.fieldCheck,
      maxStitches: Math.floor(m.maxStitches as number),
      maxColors: Math.floor(m.maxColors as number),
      specialty:
        m.specialty === "tajima-single-sequin"
          ? "tajima-single-sequin"
          : "lockstitch",
    };
  }
  if (p.approval !== undefined) {
    const a = p.approval as Record<string, unknown>;
    if (!a || typeof a !== "object")
      throw new Error("Invalid approval sheet details.");
    extra.approval = {
      client: String(a.client ?? "").slice(0, 200),
      reference: String(a.reference ?? "").slice(0, 100),
      preparedBy: String(a.preparedBy ?? "").slice(0, 100),
      notes: String(a.notes ?? "").slice(0, 2000),
    };
  }
  return {
    ...extra,
    ...(p.trimDistance !== undefined
      ? { trimDistance: p.trimDistance as number }
      : {}),
    ...(sewOuts ? { sewOuts } : {}),
    version: 1,
    name: String(p.name ?? "Untitled design").slice(0, 100),
    width: p.width as number,
    height: p.height as number,
    hoopWidth: p.hoopWidth as number,
    hoopHeight: p.hoopHeight as number,
    fabric: ["linen", "cotton", "knit", "silk"].includes(String(p.fabric))
      ? (p.fabric as Project["fabric"])
      : "linen",
    objects,
    notes: Array.isArray(p.notes)
      ? p.notes.slice(0, 20).map((x) => String(x).slice(0, 500))
      : [],
    source: ["svg", "raster", "sample", "manual"].includes(String(p.source))
      ? (p.source as Project["source"])
      : "manual",
  };
}
export function resizeProject(
  p: Project,
  width: number,
  height: number,
): Project {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("Use finite dimensions of at least 1 mm.");
  const scalePoint = (pt: Point): Point => {
    const x = (pt.x / p.width) * width,
      y = (pt.y / p.height) * height;
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error(
        "The resized coordinates exceed numeric precision. Choose a smaller scale.",
      );
    return { ...pt, x, y };
  };
  return {
    ...p,
    width,
    height,
    ...(p.artworkLayer
      ? {
          artworkLayer: resizeArtworkLayer(
            p.artworkLayer,
            width / p.width,
            height / p.height,
          ),
        }
      : {}),
    startPoint: p.startPoint ? scalePoint(p.startPoint) : undefined,
    endPoint: p.endPoint ? scalePoint(p.endPoint) : undefined,
    objects: p.objects.map((o) => transformObject(o, scalePoint)),
  };
}

function validateSewOuts(raw: unknown): NonNullable<Project["sewOuts"]> {
  if (!Array.isArray(raw) || raw.length > 100)
    throw new Error("Invalid sew-out records.");
  return raw.map((value) => {
    if (
      !value ||
      typeof value !== "object" ||
      !["pending", "revise", "passed"].includes(value.result) ||
      typeof value.speed !== "number" ||
      !Number.isFinite(value.speed) ||
      value.speed < 100 ||
      value.speed > 1500
    )
      throw new Error("Invalid sew-out record.");
    const result: Record<string, unknown> = {
      result: value.result,
      speed: value.speed,
    };
    if (value.format !== undefined) {
      if (!["dst", "pes", "jef", "exp"].includes(value.format))
        throw new Error("Invalid sew-out format.");
      result.format = value.format;
    }
    if (value.fileSha256 !== undefined) {
      if (!/^[a-f0-9]{64}$/i.test(value.fileSha256))
        throw new Error("Invalid exported file SHA-256.");
      result.fileSha256 = value.fileSha256.toLowerCase();
    }
    for (const key of ["firmware", "operator", "evidenceURL"]) {
      if (value[key] !== undefined) {
        if (typeof value[key] !== "string" || value[key].length > 2000)
          throw new Error("Invalid sew-out evidence.");
        result[key] = value[key];
      }
    }
    if (value.controllerAccepted !== undefined)
      result.controllerAccepted = value.controllerAccepted === true;
    for (const key of ["measuredWidth", "measuredHeight", "threadBreaks"]) {
      if (value[key] !== undefined) {
        if (
          typeof value[key] !== "number" ||
          !Number.isFinite(value[key]) ||
          value[key] < 0 ||
          (key === "threadBreaks" && value[key] > 10000)
        )
          throw new Error("Invalid sew-out measurements.");
        result[key] = value[key];
      }
    }
    for (const key of [
      "id",
      "date",
      "machine",
      "fabric",
      "stabilizer",
      "thread",
      "needle",
      "notes",
      "designFingerprint",
    ]) {
      if (typeof value[key] !== "string")
        throw new Error("Incomplete sew-out record.");
      result[key] = value[key].slice(0, key === "notes" ? 2000 : 200);
    }
    return result as Project["sewOuts"] extends (infer T)[] | undefined
      ? T
      : never;
  });
}
