import { underlayPrograms } from "./underlay";
import { objectUnderlays } from "./underlay-settings";
import { curvePaths } from "./reshape";
import { sewingThreadKey, isSewingObject } from "./sewing-input";
import { createFillRouter } from "./fill-routing";
import {
  boundaryConnector,
  orderedTatamiRows,
  tatamiBands,
  tatamiNeedles,
  type FillRow,
} from "./tatami";
import { bounds, distance, lerp, rotate, segmentInside } from "./geometry";
import { stitchPrograms } from "./stitch-programs";
import { outlinePaths } from "./operations";
import { LINE_TYPES } from "./types";
import { splitPositions } from "./effects";
import { startOrigin } from "./machine-settings";
import type {
  Project,
  Point,
  EmbroideryObject,
  Stitch,
  StitchPlan,
  Issue,
  StitchBlock,
} from "./types";
const MAX_STITCHES = 350000;
const AREA_STRUCTURES = new Set([
  "tatami",
  "satin",
  "raised-satin",
  "program-split",
  "satin-column",
  "column-c",
  "square-fill",
  "double-square",
  "contour",
  "island-coil",
  "spiral",
  "ripple",
]);
export function generatePlan(project: Project): StitchPlan {
  const stitches: Stitch[] = [],
    issues: Issue[] = [],
    blocks: StitchBlock[] = [];
  let activeUnderlayLayer: string | undefined;
  let activeUnderlayLength = 3;
  let previousThread = "",
    last: Point = startOrigin(project);
  const push = (
    p: Point,
    o: EmbroideryObject,
    command: Stitch["command"] = "stitch",
    underlay = false,
  ) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
      throw new Error("Invalid vector coordinates. Reimport a clean SVG.");
    if (stitches.length >= MAX_STITCHES)
      throw new Error(
        "This draft exceeds 350,000 stitch commands. Increase row spacing or split the artwork into smaller designs.",
      );
    // Retain geometric corners even when their final segment is very short.
    // Dropping one before a turn can cut across a hole. Machine precision is
    // handled once, after absolute coordinate rounding in machineStream.
    if (
      command === "stitch" &&
      !o.sequinMode &&
      stitches.length &&
      distance(last, p) < 1e-8
    )
      return;
    stitches.push({
      ...p,
      objectId: o.id,
      color: o.color,
      command,
      underlay,
      ...(underlay && activeUnderlayLayer
        ? { underlayLayer: activeUnderlayLayer }
        : {}),
    });
    last = p;
  };
  const sew = (
    p: Point,
    o: EmbroideryObject,
    max: number,
    underlay: boolean,
  ) => {
    const from = last,
      n = Math.max(1, Math.ceil((distance(from, p) - 1e-9) / max));
    for (let i = 1; i <= n; i++)
      push(lerp(from, p, i / n), o, "stitch", underlay);
  };
  const tieOff = (o: EmbroideryObject) => {
    const tail = stitches[stitches.length - 1],
      prev = stitches[stitches.length - 2];
    if (
      o.tieOut === false ||
      !tail ||
      !prev ||
      tail.command !== "stitch" ||
      prev.command !== "stitch" ||
      tail.objectId !== prev.objectId
    )
      return;
    const d = distance(tail, prev);
    if (d < 0.2) return;
    const p = lerp(tail, prev, Math.min(0.6 / d, 0.7));
    push(p, o, "stitch", !!tail.underlay);
    push(tail, o, "stitch", !!tail.underlay);
    push(p, o, "stitch", !!tail.underlay);
  };
  for (const raw of project.objects) {
    // Compiled rails are paired already. Do not resample Column B a second
    // time in outline/underlay helpers; retain the original editable object.
    const o = {
      ...raw,
      paths: curvePaths(raw),
      columnKind: raw.columnKind === "B" ? ("A" as const) : raw.columnKind,
    };
    if (!isSewingObject(o) || !o.paths.some((p) => p.length > 1)) continue;
    const start = stitches.length;
    const contours = outlinePaths(o);
    let underlayContours = contours;
    let underlayRule = o.fillRule;
    const routeFill = createFillRouter(contours, o.fillRule);
    let routeUnderlay = createFillRouter(underlayContours, underlayRule);
    const isArea = AREA_STRUCTURES.has(o.type);
    const isFilled =
      !LINE_TYPES.includes(o.type) ||
      ["column-c", "satin-column"].includes(o.type);
    const threadKey = sewingThreadKey(o);
    if (previousThread && previousThread !== threadKey) push(last, o, "color");
    previousThread = threadKey;
    const satinMaxLength = o.satinMaxLength ?? 7;
    if (o.entryPoint) push(o.entryPoint, o, "jump");
    let first = true,
      splits = false;
    const connect = (p: Point, next: Point, underlay: boolean) => {
      const d = distance(last, p);
      const travelContours = underlay ? underlayContours : contours;
      const travelRule = underlay ? underlayRule : o.fillRule;
      if (
        !first &&
        isFilled &&
        (isArea || underlay || !o.connector || o.connector === "auto")
      ) {
        const tolerance = underlay || !isArea ? 0.000001 : o.pull + 0.000001;
        // Stitch segments inside a continuous filled region are part of its
        // structure. The connector setting governs disconnected regions.
        const route =
          isArea || underlay
            ? (underlay ? routeUnderlay : routeFill)(last, p, tolerance)
            : d < 4 &&
                segmentInside(last, p, travelContours, travelRule, tolerance)
              ? [last, p]
              : boundaryConnector(
                  last,
                  p,
                  travelContours,
                  travelRule,
                  tolerance,
                  Infinity,
                );
        if (route) {
          for (const point of route.slice(1))
            sew(
              point,
              o,
              Math.min(o.length, 3, underlay ? activeUnderlayLength : Infinity),
              underlay,
            );
          return;
        }
      }
      if (
        !first &&
        d < 1e-8 &&
        (!o.connector || o.connector === "auto" || isArea)
      )
        return;
      {
        const trimmed = !first && (d > 2.5 || o.connector === "trim");
        if (trimmed) {
          tieOff(o);
          push(last, o, "trim");
        }
        push(p, o, "jump", underlay);
        const length = distance(p, next);
        if (o.tieIn !== false && (first || trimmed) && length > 0.5) {
          const anchor = lerp(
            p,
            next,
            Math.min(
              (underlay ? Math.min(0.6, activeUnderlayLength) : 0.6) / length,
              0.4,
            ),
          );
          push(anchor, o, "stitch", underlay);
          push(p, o, "stitch", underlay);
        }
      }
      first = false;
    };
    if (
      o.underlay &&
      (!LINE_TYPES.includes(o.type) || o.type === "column-c") &&
      !o.sequinMode
    ) {
      const generated = new Set<string>();
      let lastContours: Point[][] | undefined;
      for (const program of underlayPrograms(o)) {
        if (program.contours !== lastContours) {
          lastContours = program.contours;
          underlayContours = program.contours;
          underlayRule = program.rule;
          routeUnderlay = createFillRouter(underlayContours, underlayRule);
        }
        activeUnderlayLayer = program.layer.id;
        activeUnderlayLength = program.maxLength;
        connect(program.points[0], program.points[1], true);
        for (const point of program.points.slice(1))
          sew(point, o, program.maxLength, true);
        generated.add(program.layer.id);
      }
      activeUnderlayLayer = undefined;
      for (const layer of objectUnderlays(o).filter(
        (l) => l.enabled && !generated.has(l.id),
      ))
        issues.push({
          level: "warning",
          objectId: o.id,
          message: `${o.name}: ${layer.kind} underlay did not fit. Reduce its inset or spacing.`,
        });
    }
    if (o.sequinMode) {
      for (const path of o.paths) {
        if (!path.length) continue;
        push(path[0], o, "jump");
        for (const point of path) push(point, o, "stitch");
      }
    } else if (LINE_TYPES.includes(o.type) || o.type === "satin-column") {
      for (const program of stitchPrograms(o)) {
        if (program.points.length < 2) continue;
        connect(program.points[0], program.points[1], !!program.underlay);
        for (const point of program.points.slice(1)) {
          if (
            ["satin-column", "column-c"].includes(o.type) &&
            !program.underlay &&
            distance(last, point) > satinMaxLength
          )
            splits = true;
          if (
            ["satin-column", "column-c"].includes(o.type) &&
            !segmentInside(last, point, contours, o.fillRule, o.pull + 1e-6)
          ) {
            const route = routeFill(last, point, o.pull + 1e-6);
            if (!route)
              throw new Error(
                `${o.name}: the satin rails cross or create disconnected areas. Reshape the rails or divide the column at this turn.`,
              );
            for (const p of route.slice(1))
              sew(p, o, program.maxLength, !!program.underlay);
          } else sew(point, o, program.maxLength, !!program.underlay);
        }
      }
    } else {
      const fill = (underlay: boolean, extraAngle = 0, layer = 0) => {
        const a =
          ((o.angle + (underlay ? 90 : 0) + extraAngle) * Math.PI) / 180;
        const paths = (underlay ? underlayContours : contours)
          .filter((p) => p.length >= 3)
          .map((path) => path.map((p) => rotate(p, -a)));
        const satin = !underlay && ["satin", "raised-satin"].includes(o.type);
        const b = bounds(paths),
          spacing = underlay ? 2.2 : Math.max(0.2, o.spacing) / (satin ? 2 : 1);
        const sewRow = (
          { left: rawLeft, right: rawRight, y, index: row }: FillRow,
          reverse: boolean,
          bandStart: boolean,
        ) => {
          let left = rawLeft,
            right = rawRight;
          if (!underlay) {
            left -= o.pull;
            right += o.pull;
            if (o.edgeEffect && o.edgeEffect !== "none") {
              const amount = Math.min(
                o.effectDepth ?? 0.6,
                (right - left) * 0.4,
              );
              const phase =
                o.edgeEffect === "feather"
                  ? (1 + Math.sin(row * 2.399963)) / 2
                  : ((row * 17) % 11) / 10;
              left += amount * phase;
              right -= amount * (1 - phase);
            }
          }
          if (right - left < 0.12) return;
          const from = rotate({ x: reverse ? right : left, y }, a),
            to = rotate({ x: reverse ? left : right, y }, a);
          if (satin) {
            if (distance(from, to) > satinMaxLength) splits = true;
            if (bandStart) connect(from, to, false);
            else if (
              segmentInside(last, from, contours, o.fillRule, o.pull + 1e-6)
            )
              sew(from, o, satinMaxLength, false);
            else {
              connect(to, from, false);
              sew(from, o, satinMaxLength, false);
            }
            return;
          }
          connect(from, to, underlay);
          const length = distance(from, to);
          const max =
            !underlay && ["satin", "raised-satin"].includes(o.type)
              ? satinMaxLength
              : Math.max(0.6, o.length);
          if (
            ["satin", "raised-satin"].includes(o.type) &&
            !underlay &&
            length > satinMaxLength
          )
            splits = true;
          if (o.type === "program-split" && !underlay) {
            for (const x of splitPositions(
              o,
              left,
              right,
              y,
              reverse ? 1 : 0,
            ).slice(1))
              sew(rotate({ x, y }, a), o, max, false);
          } else if (o.type === "tatami" && !underlay) {
            const needles = tatamiNeedles(
              left,
              right,
              b.minX,
              row,
              max,
              o.tatamiOffset ?? 0.25,
              o.tatamiMinStitch ?? 0.5,
              reverse,
            );
            for (const x of needles.slice(1))
              sew(rotate({ x, y }, a), o, max, false);
          } else sew(to, o, max, underlay);
        };
        {
          const bands = tatamiBands(
            paths,
            underlay ? underlayRule : o.fillRule,
            spacing,
            underlay || o.type !== "tatami" ? undefined : o.spacingEnd,
            (layer * spacing) / (o.satinLayers ?? 3),
          );
          for (const { row, reverse, bandStart } of orderedTatamiRows(
            bands,
            rotate(last, -a),
            satin,
          ))
            sewRow(row, reverse, bandStart);
        }
      };
      if (o.type === "raised-satin") {
        for (let layer = 0; layer < (o.satinLayers ?? 3); layer++)
          fill(false, 0, layer);
      } else if (["tatami", "satin", "program-split"].includes(o.type))
        fill(false);
      else
        for (const program of stitchPrograms(o)) {
          if (program.points.length < 2) continue;
          connect(program.points[0], program.points[1], false);
          for (const point of program.points.slice(1))
            sew(point, o, program.maxLength, false);
        }
    }
    if (stitches.length > start) {
      tieOff(o);
      if (o.exitPoint) push(o.exitPoint, o, "jump");
      push(last, o, "trim");
    }
    const stitchCount = stitches
      .slice(start)
      .filter((s) => s.command === "stitch").length;
    if (stitchCount)
      blocks.push({
        objectId: o.id,
        color: o.color,
        start,
        end: stitches.length,
        stitchCount,
      });
    else
      issues.push({
        level: "warning",
        objectId: o.id,
        message: `${o.name}: no stitches fit. Check size, geometry and row spacing.`,
      });
    if (splits)
      issues.push({
        level: "warning",
        objectId: o.id,
        message: `${o.name}: satin spans above ${satinMaxLength} mm were split. Adjust Maximum satin stitch or review the column width.`,
      });
    const b = bounds(o.paths);
    if (
      Math.min(b.maxX - b.minX, b.maxY - b.minY) < 0.8 &&
      !LINE_TYPES.includes(o.type)
    )
      issues.push({
        level: "warning",
        objectId: o.id,
        message: `${o.name}: details below 0.8 mm need a sew-out or a running stitch.`,
      });
    if (o.spacing < 0.3 && !LINE_TYPES.includes(o.type))
      issues.push({
        level: "warning",
        objectId: o.id,
        message: `${o.name}: dense spacing. Check thread buildup and fabric distortion.`,
      });
  }
  // Retain short same-colour jumps when requested. Ties remain intact; these
  // are floating connectors, never extra sewn lines across visible artwork.
  if ((project.trimDistance ?? 0) > 0) {
    const protectedTrims = new Set(
      project.objects
        .filter((o) => o.forceTrim || o.connector === "trim")
        .map((o) => o.id),
    );
    const filtered = stitches.filter((stitch, i) => {
      if (stitch.command !== "trim" || protectedTrims.has(stitch.objectId))
        return true;
      const next = stitches[i + 1];
      return (
        !next ||
        next.command !== "jump" ||
        next.color !== stitch.color ||
        protectedTrims.has(next.objectId) ||
        distance(stitch, next) > (project.trimDistance ?? 0)
      );
    });
    stitches.length = 0;
    for (const stitch of filtered) stitches.push(stitch);
    blocks.length = 0;
    for (let start = 0; start < stitches.length; ) {
      let end = start + 1;
      while (
        end < stitches.length &&
        stitches[end].objectId === stitches[start].objectId
      )
        end++;
      const stitchCount = stitches
        .slice(start, end)
        .filter((s) => s.command === "stitch").length;
      if (stitchCount)
        blocks.push({
          objectId: stitches[start].objectId,
          color: stitches[start].color,
          start,
          end,
          stitchCount,
        });
      start = end;
    }
  }
  const firstMovement = stitches.find(
    (s) => s.command === "jump" || s.command === "stitch",
  );
  const origin = startOrigin(project, firstMovement);
  const tail = stitches.at(-1);
  if (tail && project.autoEnd && project.autoEnd !== "last") {
    const end =
      project.autoEnd === "custom" && project.endPoint
        ? project.endPoint
        : origin;
    if (distance(tail, end) > 0.05) {
      if (stitches.length >= MAX_STITCHES)
        throw new Error("End movement exceeds the command budget.");
      stitches.push({ ...tail, ...end, command: "jump", underlay: false });
      if (blocks.length) blocks[blocks.length - 1].end = stitches.length;
    }
  }
  const sewn = stitches.filter((s) => s.command === "stitch");
  const b = bounds([sewn]);
  const hx = (project.width - project.hoopWidth) / 2,
    hy = (project.height - project.hoopHeight) / 2;
  if (
    project.workspaceMode !== "freeform" &&
    sewn.length &&
    (b.minX < hx ||
      b.minY < hy ||
      b.maxX > hx + project.hoopWidth ||
      b.maxY > hy + project.hoopHeight)
  )
    issues.unshift({
      level: "error",
      message:
        "Stitches exceed the selected hoop. Resize or select a larger hoop before export.",
    });
  let threadMM = 0,
    stitchCount = 0,
    jumpCount = 0,
    jumpMM = 0,
    trimCount = 0,
    colorChanges = 0;
  for (let i = 0; i < stitches.length; i++) {
    const s = stitches[i];
    if (s.command === "stitch") {
      stitchCount++;
      if (i) threadMM += distance(stitches[i - 1], s);
    } else if (s.command === "jump") {
      jumpCount++;
      jumpMM += distance(i ? stitches[i - 1] : origin, s);
    } else if (s.command === "trim") trimCount++;
    else colorChanges++;
  }
  return {
    stitches,
    blocks,
    issues,
    stitchCount,
    jumpCount,
    jumpMM,
    trimCount,
    colorChanges,
    threadMM,
    estimatedMinutes:
      stitchCount / 700 + trimCount * 0.06 + colorChanges * 0.12,
    bounds: b,
  };
}
