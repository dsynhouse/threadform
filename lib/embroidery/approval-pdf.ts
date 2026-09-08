import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  type PDFPage,
} from "pdf-lib";
import { bounds } from "./geometry";
import { outlinePaths, designFingerprint } from "./operations";
import { normalizePolygons } from "./polygons";
import {
  LINE_TYPES,
  STITCH_NAMES,
  type Project,
  type StitchPlan,
  type Point,
} from "./types";
export type ApprovalOptions = {
  paper: "a4" | "letter";
  view: "artwork" | "stitches";
  actualSize?: boolean;
  date?: string;
};
const MM = 72 / 25.4;
const color = (hex: string) =>
  rgb(
    ...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ]),
  );
const pathData = (paths: Point[][], closed: boolean) =>
  paths
    .map((p) =>
      p.length
        ? "M " +
          p.map((v) => `${v.x.toFixed(3)} ${v.y.toFixed(3)}`).join(" L ") +
          (closed ? " Z" : "")
        : "",
    )
    .join(" ");
import { measurementText } from "./units";
export async function createApprovalPDF(
  project: Project,
  plan: StitchPlan,
  options: ApprovalOptions,
  fonts: { regular: Uint8Array; bold: Uint8Array },
): Promise<Uint8Array> {
  const units = project.units ?? "mm";
  const sizeLabel = (w: number, h: number) =>
    `${measurementText(w, units)} x ${measurementText(h, units)} ${units}`;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true }),
    bold = await pdf.embedFont(fonts.bold, { subset: true });
  pdf.setTitle(project.name + " - Embroidery approval");
  pdf.setAuthor(project.approval?.preparedBy || "DSYN House / Threadform");
  pdf.setSubject(
    "Design approval and thread sequence; physical sew-out qualification is separate.",
  );
  pdf.setCreator("Threadform Studio 0.4");
  const [W, H] = options.paper === "letter" ? [612, 792] : [595.28, 841.89],
    M = 38,
    ink = color("#1f3048"),
    muted = color("#66758a"),
    blue = color("#2557dc");
  const charset = new Set(regular.getCharacterSet());
  let missing = false;
  const clean = (s: string) =>
    Array.from(
      s.replace(/[\r\n\t]/g, " ").replace(/[\u2011\u2013\u2014]/g, "-"),
    )
      .map((c) => {
        if (charset.has(c.codePointAt(0)!)) return c;
        missing = true;
        return "?";
      })
      .join("");
  const text = (
    page: PDFPage,
    s: string,
    x: number,
    y: number,
    size = 10,
    strong = false,
    c = ink,
    maxWidth?: number,
  ) => {
    let value = clean(s);
    const font = strong ? bold : regular;
    if (maxWidth)
      while (value.length && font.widthOfTextAtSize(value, size) > maxWidth)
        value = value.slice(0, -1);
    page.drawText(value, { x, y, size, font, color: c });
  };
  const wrapped = (
    page: PDFPage,
    s: string,
    x: number,
    y: number,
    width: number,
    size = 10,
    leading = 15,
  ) => {
    const lines: string[] = [];
    for (const paragraph of s.split(/\r?\n/)) {
      let line = "";
      for (const word of clean(paragraph).split(/\s+/)) {
        if (
          regular.widthOfTextAtSize(line + (line ? " " : "") + word, size) <=
          width
        )
          line += (line ? " " : "") + word;
        else {
          if (line) lines.push(line);
          line = "";
          let tail = word;
          while (regular.widthOfTextAtSize(tail, size) > width) {
            let n = 1;
            while (
              n < tail.length &&
              regular.widthOfTextAtSize(tail.slice(0, n + 1), size) <= width
            )
              n++;
            lines.push(tail.slice(0, n));
            tail = tail.slice(n);
          }
          line = tail;
        }
      }
      lines.push(line);
    }
    for (const line of lines) {
      text(page, line, x, y, size);
      y -= leading;
    }
    return y;
  };
  const heading = (title: string, subtitle: string) => {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: blue });
    text(p, "DSYN HOUSE  /  THREADFORM", M, H - 40, 9, true, blue);
    text(p, title, M, H - 72, 22, true, ink, W - 2 * M);
    text(p, subtitle, M, H - 94, 9, false, muted, W - 2 * M);
    return p;
  };
  const b =
    options.view === "stitches" && plan.stitchCount
      ? plan.bounds
      : bounds(project.objects.flatMap(outlinePaths));
  const dw = Math.max(0.1, b.maxX - b.minX),
    dh = Math.max(0.1, b.maxY - b.minY);
  const tileCount = options.actualSize
    ? Math.ceil(dw / ((W - 2 * M) / MM)) * Math.ceil(dh / ((H - 160) / MM))
    : 0;
  if (tileCount > 64)
    throw new Error(
      "Actual-size printing exceeds 64 pages. Use a smaller selection.",
    );
  if (
    options.view === "stitches" &&
    (tileCount + 1) * plan.stitchCount > 3000000
  )
    throw new Error(
      "Tiled stitch proof is too complex. Use vector artwork for the actual-size templates.",
    );
  const drawDesign = (
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    height: number,
    scale?: number,
    offsetX = b.minX,
    offsetY = b.minY,
  ) => {
    const s = scale ?? Math.min(width / dw, height / dh),
      ox = scale ? x : x + (width - dw * s) / 2,
      oy = scale ? y + height : y + (height + dh * s) / 2;
    page.pushOperators(
      pushGraphicsState(),
      moveTo(x, y),
      lineTo(x + width, y),
      lineTo(x + width, y + height),
      lineTo(x, y + height),
      closePath(),
      clip(),
      endPath(),
    );
    if (options.view === "artwork")
      for (const o of project.objects) {
        const isLine = LINE_TYPES.includes(o.type) && o.type !== "column-c";
        const paths = isLine
          ? o.paths
          : normalizePolygons(outlinePaths(o), o.fillRule);
        const d = isLine
          ? paths.map((p, i) => pathData([p], o.closed[i])).join(" ")
          : pathData(paths, true);
        if (!d) continue;
        page.drawSvgPath(d, {
          x: ox - offsetX * s,
          y: oy + offsetY * s,
          scale: s,
          ...(isLine
            ? { borderColor: color(o.color), borderWidth: 0.3 }
            : { color: color(o.color) }),
        });
      }
    else {
      for (const block of plan.blocks) {
        let commands = "";
        const flush = () => {
          if (commands) {
            page.drawSvgPath(commands, {
              x: ox - offsetX * s,
              y: oy + offsetY * s,
              scale: s,
              borderColor: color(block.color),
              borderWidth: 0.24,
            });
            commands = "";
          }
        };
        for (let i = Math.max(1, block.start); i < block.end; i++) {
          const a = plan.stitches[i - 1],
            p = plan.stitches[i];
          if (p.command !== "stitch") continue;
          commands += `M ${a.x.toFixed(3)} ${a.y.toFixed(3)} L ${p.x.toFixed(3)} ${p.y.toFixed(3)} `;
          if (commands.length > 100000) flush();
        }
        flush();
      }
    }
    page.pushOperators(popGraphicsState());
  };
  const date = options.date ?? new Date().toISOString().slice(0, 10),
    details = project.approval;
  const p = heading(
    "Embroidery approval",
    `${project.name}  |  ${details?.reference || "Design proof"}  |  ${date}`,
  );
  text(
    p,
    `Client: ${details?.client || "____________________________"}`,
    M,
    H - 122,
    10,
    true,
    ink,
    W - 2 * M,
  );
  text(
    p,
    `Prepared by: ${details?.preparedBy || "DSYN House"}`,
    M,
    H - 140,
    9,
    false,
    muted,
    W - 2 * M,
  );
  const stats = [
    sizeLabel(dw, dh),
    `${plan.stitchCount.toLocaleString("en-US")} stitches`,
    `${new Set(plan.blocks.map((b) => b.color)).size} screen colours`,
    `${plan.colorChanges} colour changes`,
  ];
  stats.forEach((s, i) =>
    text(p, s, M + (i * (W - 2 * M)) / 4, H - 171, 9, true),
  );
  const previewY = 244,
    previewH = H - 440;
  p.drawRectangle({
    x: M,
    y: previewY,
    width: W - 2 * M,
    height: previewH,
    color: color("#f8f7f3"),
    borderColor: color("#dde3ec"),
    borderWidth: 0.5,
  });
  drawDesign(p, M + 12, previewY + 12, W - 2 * M - 24, previewH - 24);
  text(
    p,
    `${options.view === "stitches" ? "Planned stitch paths" : "Vector artwork"} - fitted proof; dimensions above give physical sewn/artwork size.`,
    M,
    previewY - 17,
    8,
    false,
    muted,
  );
  text(
    p,
    `Fabric preset: ${project.fabric}  |  ${project.workspaceMode === "freeform" ? "Freeform design" : "Hoop reference: " + sizeLabel(project.hoopWidth, project.hoopHeight)}`,
    M,
    207,
    9,
  );
  wrapped(
    p,
    "Approval confirms the artwork, placement and thread references. Check physical thread cards and a sew-out on the intended fabric before production.",
    M,
    185,
    W - 2 * M,
    9,
    13,
  );
  text(
    p,
    "Decision:    [  ] Approved    [  ] Approved with changes    [  ] Revise",
    M,
    139,
    10,
    true,
  );
  text(
    p,
    "Approved by: __________________________     Date: ______________",
    M,
    109,
    10,
  );
  text(
    p,
    "Signature: ___________________________________________________",
    M,
    81,
    10,
  );
  // Sequence tables paginate instead of shrinking or clipping dense thread lists.
  let table = heading("Thread & sewing sequence", project.name),
    y = H - 128;
  const tableHead = () => {
    table.drawRectangle({
      x: M,
      y: y - 7,
      width: W - 2 * M,
      height: 25,
      color: color("#edf1fa"),
    });
    text(table, "PASS", M + 8, y, 8, true);
    text(table, "OBJECT / METHOD", M + 62, y, 8, true);
    text(table, "THREAD REFERENCE", M + 253, y, 8, true);
    text(table, "STITCHES", W - M - 59, y, 8, true);
    y -= 31;
  };
  tableHead();
  for (let i = 0; i < plan.blocks.length; i++) {
    if (y < 95) {
      table = heading("Thread sequence - continued", project.name);
      y = H - 128;
      tableHead();
    }
    const block = plan.blocks[i],
      o = project.objects.find((o) => o.id === block.objectId),
      thread = o?.thread;
    text(table, String(i + 1), M + 8, y, 9, true);
    table.drawRectangle({
      x: M + 35,
      y: y - 3,
      width: 14,
      height: 14,
      color: color(block.color),
      borderWidth: 0.3,
      borderColor: color("#bac2d0"),
    });
    text(table, o?.name ?? "Object", M + 62, y, 9, true, ink, 180);
    text(
      table,
      o ? STITCH_NAMES[o.type] : "",
      M + 62,
      y - 13,
      8,
      false,
      muted,
      180,
    );
    text(
      table,
      thread ? `${thread.brand} ${thread.code}` : block.color.toUpperCase(),
      M + 253,
      y,
      9,
      true,
      ink,
      W - M - (M + 253) - 69,
    );
    text(
      table,
      thread ? `${thread.line} ${thread.name}` : "Physical shade unassigned",
      M + 253,
      y - 13,
      8,
      false,
      muted,
      W - M - (M + 253) - 69,
    );
    text(table, block.stitchCount.toLocaleString("en-US"), W - M - 57, y, 9);
    table.drawLine({
      start: { x: M, y: y - 24 },
      end: { x: W - M, y: y - 24 },
      thickness: 0.4,
      color: color("#e0e5ee"),
    });
    y -= 43;
  }
  const notes = [
    details?.notes,
    ...project.notes,
    ...plan.issues.map((i) => `${i.level.toUpperCase()}: ${i.message}`),
  ].filter(Boolean) as string[];
  if (notes.length) {
    let np = heading("Design notes", project.name),
      ny = H - 126;
    for (const note of notes) {
      // Wrap into small chunks first, then flow across pages with a fixed readable size.
      const words = clean(note).split(/\s+/);
      let line = "";
      for (const word of words) {
        if (regular.widthOfTextAtSize(line + " " + word, 10) > W - 2 * M) {
          if (ny < 74) {
            np = heading("Design notes - continued", project.name);
            ny = H - 126;
          }
          ny = wrapped(np, line, M, ny, W - 2 * M, 10, 15);
          line = word;
        } else line += (line ? " " : "") + word;
      }
      if (ny < 90) {
        np = heading("Design notes - continued", project.name);
        ny = H - 126;
      }
      ny = wrapped(np, line, M, ny, W - 2 * M, 10, 15) - 12;
    }
  }
  if (options.actualSize) {
    const tileW = (W - 2 * M) / MM,
      tileH = (H - 160) / MM,
      cols = Math.ceil(dw / tileW),
      rows = Math.ceil(dh / tileH);
    if (cols * rows > 64)
      throw new Error(
        "Actual-size printing exceeds 64 pages. Use a larger paper workflow or print a smaller selection.",
      );
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const page = heading(
          "Actual-size template",
          `${project.name} | Tile ${row + 1}, ${col + 1} of ${rows} rows x ${cols} columns`,
        );
        const bottom = 58,
          height = H - 160;
        drawDesign(
          page,
          M,
          bottom,
          W - 2 * M,
          height,
          MM,
          b.minX + col * tileW,
          b.minY + row * tileH,
        );
        page.drawRectangle({
          x: M,
          y: bottom,
          width: W - 2 * M,
          height,
          borderColor: muted,
          borderWidth: 0.4,
        });
        for (const [x, y] of [
          [M, bottom],
          [W - M, bottom],
          [M, bottom + height],
          [W - M, bottom + height],
        ]) {
          page.drawLine({
            start: { x: x - 4, y },
            end: { x: x + 4, y },
            thickness: 0.5,
            color: ink,
          });
          page.drawLine({
            start: { x, y: y - 4 },
            end: { x, y: y + 4 },
            thickness: 0.5,
            color: ink,
          });
        }
        text(
          page,
          "Print at 100% / Actual size. Disable Fit to page. Trim and join at the tile borders.",
          M,
          43,
          8,
          false,
          muted,
        );
        page.drawLine({
          start: { x: M, y: 28 },
          end: { x: M + 20 * MM, y: 28 },
          thickness: 1,
          color: ink,
        });
        text(page, "20 mm", M + 20 * MM + 6, 25, 8);
      }
  }
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    if (
      !options.actualSize ||
      i <
        pages.length -
          Math.ceil(dw / ((W - 2 * M) / MM)) * Math.ceil(dh / ((H - 160) / MM))
    ) {
      text(
        page,
        `Threadform | ${designFingerprint(project)} | ${i + 1} / ${pages.length}`,
        M,
        28,
        7,
        false,
        muted,
      );
      if (missing)
        text(
          page,
          "Some unsupported text glyphs appear as ?. Original text remains in the editable project.",
          M,
          16,
          6,
          false,
          muted,
        );
    }
  });
  return pdf.save();
}
