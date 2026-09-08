import { makeObject, type Point, type Project } from "./types";
import {
  identity,
  multiply,
  parsePath,
  parseTransform,
  transformPoint,
  type Matrix,
} from "./svg-path";
import { suggestType } from "./geometry";
import { assertGeometryBudget, GEOMETRY_BUDGET } from "./complexity";
const numbers = (s: string) =>
  (s.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || []).map(Number);
function millimeters(s: string | null): number | null {
  if (!s || s.includes("%")) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const unit = s.replace(/[\d.\-+\seE]/g, "").toLowerCase();
  return (
    n *
    ({
      mm: 1,
      cm: 10,
      in: 25.4,
      pt: 25.4 / 72,
      pc: 25.4 / 6,
      px: 25.4 / 96,
      "": 25.4 / 96,
    }[unit] ?? 1)
  );
}
function colorHex(value: string): string {
  if (/url\s*\(/i.test(value))
    throw new Error(
      "Expand gradients and patterns into solid-colour paths before importing.",
    );
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const rgba = ctx.getImageData(0, 0, 1, 1).data;
  if (rgba[3] < 255)
    throw new Error(
      "Flatten transparent colours to solid colours before importing.",
    );
  return (
    "#" +
    [...rgba.slice(0, 3)].map((x) => x.toString(16).padStart(2, "0")).join("")
  );
}
export function importSVG(source: string, name: string): Project {
  if (source.length > 32 * 1024 * 1024)
    throw new Error("Use an SVG smaller than 32 MB.");
  const doc = new DOMParser().parseFromString(source, "image/svg+xml"),
    root = doc.documentElement;
  if (root.localName !== "svg" || doc.querySelector("parsererror"))
    throw new Error("This file is not a valid SVG.");
  if (
    doc.querySelector(
      "script, foreignObject, image, text, use, mask, clipPath, filter, animate, set",
    )
  )
    throw new Error(
      "Convert text, linked images, symbols, masks and effects into plain vector paths before importing.",
    );
  const vb = numbers(root.getAttribute("viewBox") || "");
  const vw = vb[2] || parseFloat(root.getAttribute("width") || "160"),
    vh = vb[3] || parseFloat(root.getAttribute("height") || "160");
  if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw <= 0 || vh <= 0)
    throw new Error("SVG has invalid dimensions.");
  const width = millimeters(root.getAttribute("width")) || 160,
    height = millimeters(root.getAttribute("height")) || (width * vh) / vw;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error(
      "Set finite SVG dimensions of at least 1 mm before importing.",
    );
  const aspect = root.getAttribute("preserveAspectRatio") || "xMidYMid meet";
  if (aspect.includes("slice"))
    throw new Error("Remove SVG viewport cropping before importing.");
  const scale = aspect === "none" ? null : Math.min(width / vw, height / vh),
    sx = scale ?? width / vw,
    sy = scale ?? height / vh;
  const dx = aspect.includes("xMin")
      ? 0
      : aspect.includes("xMax")
        ? width - vw * sx
        : (width - vw * sx) / 2,
    dy = aspect.includes("YMin")
      ? 0
      : aspect.includes("YMax")
        ? height - vh * sy
        : (height - vh * sy) / 2;
  const base: Matrix = [
    sx,
    0,
    0,
    sy,
    -(vb[0] || 0) * sx + dx,
    -(vb[1] || 0) * sy + dy,
  ];
  const project: Project = {
    version: 1,
    name: name.replace(/\.svg$/i, ""),
    width,
    height,
    fabric: "linen",
    hoopWidth: 200,
    hoopHeight: 200,
    workspaceMode: "freeform",
    objects: [],
    notes: [],
    source: "svg",
  };
  const cssRules: { selector: string; style: Record<string, string> }[] = [];
  const declarations = (text: string) =>
    Object.fromEntries(
      text
        .split(";")
        .map((x) => x.split(":").map((s) => s.trim()))
        .filter((x) => x.length === 2),
    );
  for (const style of [...doc.querySelectorAll("style")]) {
    if (/@|url\s*\(/i.test(style.textContent || ""))
      throw new Error(
        "Flatten external CSS and paint effects before importing.",
      );
    for (const match of (style.textContent || "").matchAll(
      /([^{}]+)\{([^{}]+)\}/g,
    ))
      for (const selector of match[1].split(","))
        cssRules.push({
          selector: selector.trim(),
          style: declarations(match[2]),
        });
  }
  let count = 0,
    totalPoints = 0,
    hadStroke = false;
  function visit(
    el: Element,
    parent: Matrix,
    inherited: Record<string, string>,
    opacity: number,
  ) {
    if (["defs", "metadata", "title", "desc", "style"].includes(el.localName))
      return;
    const style = { ...inherited };
    for (const key of [
      "fill",
      "stroke",
      "fill-rule",
      "opacity",
      "fill-opacity",
      "stroke-opacity",
      "display",
      "visibility",
    ])
      if (el.hasAttribute(key)) style[key] = el.getAttribute(key)!;
    for (const rule of cssRules) {
      try {
        if (el.matches(rule.selector)) Object.assign(style, rule.style);
      } catch {
        throw new Error(
          "Unsupported CSS selector in SVG. Use inline fill colours.",
        );
      }
    }
    Object.assign(style, declarations(el.getAttribute("style") || ""));
    const ownOpacity = Number(style.opacity ?? 1);
    delete style.opacity;
    const effective = opacity * ownOpacity;
    if (
      effective === 0 ||
      style.display === "none" ||
      style.visibility === "hidden"
    )
      return;
    if (
      effective !== 1 ||
      Number(style["fill-opacity"] ?? 1) !== 1 ||
      Number(style["stroke-opacity"] ?? 1) !== 1
    )
      throw new Error(
        "Flatten opacity and transparency to solid-colour paths before importing.",
      );
    const m = multiply(
      parent,
      parseTransform(el.getAttribute("transform") || ""),
    );
    const tolerance =
      0.06 / Math.max(0.01, Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
    if (el !== root && el.localName === "svg")
      throw new Error("Flatten nested SVG viewports before importing.");
    const n = (key: string, fallback = 0) =>
      parseFloat(el.getAttribute(key) || String(fallback));
    let paths: Point[][] = [],
      closed: boolean[] = [];
    if (el.localName === "path")
      ({ paths, closed } = parsePath(el.getAttribute("d") || "", tolerance));
    else if (el.localName === "polygon" || el.localName === "polyline") {
      const v = numbers(el.getAttribute("points") || "");
      if (v.length % 2) throw new Error("Malformed SVG point list.");
      paths = [
        Array.from({ length: v.length / 2 }, (_, i) => ({
          x: v[i * 2],
          y: v[i * 2 + 1],
        })),
      ];
      closed = [el.localName === "polygon"];
    } else if (el.localName === "line") {
      paths = [
        [
          { x: n("x1"), y: n("y1") },
          { x: n("x2"), y: n("y2") },
        ],
      ];
      closed = [false];
    } else if (el.localName === "rect") {
      const x = n("x"),
        y = n("y"),
        w = n("width"),
        h = n("height"),
        rx = Math.min(w / 2, n("rx", n("ry"))),
        ry = Math.min(h / 2, n("ry", rx));
      if (rx && ry)
        ({ paths, closed } = parsePath(
          `M ${x + rx} ${y} H ${x + w - rx} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H ${x + rx} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} V ${y + ry} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`,
          tolerance,
        ));
      else {
        paths = [
          [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ],
        ];
        closed = [true];
      }
    } else if (el.localName === "circle" || el.localName === "ellipse") {
      const cx = n("cx"),
        cy = n("cy"),
        rx = n("rx", n("r")),
        ry = n("ry", n("r"));
      const steps = Math.min(
        1200,
        Math.max(32, Math.ceil((Math.PI * 2 * Math.max(rx, ry) * sx) / 0.5)),
      );
      paths = [
        Array.from({ length: steps }, (_, i) => ({
          x: cx + rx * Math.cos((i * Math.PI * 2) / steps),
          y: cy + ry * Math.sin((i * Math.PI * 2) / steps),
        })),
      ];
      closed = [true];
    }
    paths = paths
      .map((path) => path.map((p) => transformPoint(p, m)))
      .filter((path) => path.length >= 2);
    if (
      paths.some((path) =>
        path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)),
      )
    )
      throw new Error("SVG contains non-finite coordinates.");
    totalPoints += 8 + paths.reduce((sum, p) => sum + 1 + p.length, 0);
    if (totalPoints > GEOMETRY_BUDGET)
      throw new Error(
        "SVG exceeds the vector processing budget. Simplify its contours before importing.",
      );
    if (paths.length) {
      const fill = style.fill ?? "black",
        stroke = style.stroke ?? "none",
        label =
          el.getAttribute("aria-label") ||
          el.getAttribute("id") ||
          `Shape ${++count}`;
      if (fill !== "none" && el.localName !== "line") {
        const o = makeObject({
          id: `svg-${project.objects.length}`,
          name: label,
          color: colorHex(fill),
          paths,
          closed: paths.map(() => true),
          fillRule: style["fill-rule"] === "evenodd" ? "evenodd" : "nonzero",
        });
        Object.assign(o, suggestType(o));
        project.objects.push(o);
      }
      if (stroke !== "none") {
        hadStroke = true;
        project.objects.push(
          makeObject({
            id: `svg-${project.objects.length}`,
            name: label + " outline",
            color: colorHex(stroke),
            paths,
            closed,
            type: "run",
            underlay: false,
            pull: 0,
          }),
        );
      }
    }
    for (const child of [...el.children]) visit(child, m, style, effective);
  }
  visit(root, multiply(base, identity), {}, 1);
  assertGeometryBudget(project.objects);
  if (!project.objects.length)
    throw new Error(
      "No supported vector shapes found. Convert your artwork to paths first.",
    );
  if (hadStroke)
    project.notes.push(
      "SVG strokes are running-stitch centerlines. Expand strokes to closed shapes for satin-width control.",
    );
  project.notes.push(
    "SVG curves are sampled to polygons. Check small details at the intended sewing size.",
  );
  return project;
}
