import { LINE_TYPES, type Project, type StitchPlan } from "./types";
import { outlinePaths } from "./operations";
import { bounds } from "./geometry";
import { startOrigin, machinePreflight } from "./machine-settings";
import { csvCell } from "./threads";
import { machineStream, splitMachineMoves } from "./machine-stream";
const text = new TextEncoder();
export function encodeDSTDelta(dx: number, dy: number, jump = false): number[] {
  if (
    !Number.isInteger(dx) ||
    !Number.isInteger(dy) ||
    Math.abs(dx) > 121 ||
    Math.abs(dy) > 121
  )
    throw new Error("DST movement exceeds the format range.");
  const b = [0, 0, jump ? 0x83 : 0x03];
  const xs = [
      [81, 2, 2, 3],
      [27, 1, 2, 3],
      [9, 0, 2, 3],
      [3, 1, 0, 1],
      [1, 0, 0, 1],
    ],
    ys = [
      [81, 2, 5, 4],
      [27, 1, 5, 4],
      [9, 0, 5, 4],
      [3, 1, 7, 6],
      [1, 0, 7, 6],
    ];
  for (const [weight, byte, pos, neg] of xs) {
    if (dx > weight / 2) {
      b[byte] |= 1 << pos;
      dx -= weight;
    } else if (dx < -weight / 2) {
      b[byte] |= 1 << neg;
      dx += weight;
    }
  }
  for (const [weight, byte, pos, neg] of ys) {
    if (dy > weight / 2) {
      b[byte] |= 1 << pos;
      dy -= weight;
    } else if (dy < -weight / 2) {
      b[byte] |= 1 << neg;
      dy += weight;
    }
  }
  if (dx || dy) throw new Error("DST coordinate encoding failed.");
  return b;
}
export function exportDST(project: Project, plan: StitchPlan): Uint8Array {
  if (!plan.stitchCount) throw new Error("There are no stitches to export.");
  const errors = [...plan.issues, ...machinePreflight(project, plan)].filter(
    (i) => i.level === "error",
  );
  if (errors.length) throw new Error(errors[0].message);
  const origin = startOrigin(
    project,
    plan.stitches.find((s) => s.command === "jump" || s.command === "stitch"),
  );
  const check =
      project.machine?.fieldCheck ?? project.workspaceMode !== "freeform",
    fieldWidth = project.machine?.fieldWidth ?? project.hoopWidth,
    fieldHeight = project.machine?.fieldHeight ?? project.hoopHeight;
  const centerX = (project.width / 2 - origin.x) * 10,
    centerY = (origin.y - project.height / 2) * 10;
  const records: number[] = [];
  let x = 0,
    y = 0,
    minX = 0,
    minY = 0,
    maxX = 0,
    maxY = 0,
    colors = 0;
  const move = (nx: number, ny: number, jump: boolean) => {
    if (
      check &&
      (Math.abs(nx - centerX) > fieldWidth * 5 + 1e-7 ||
        Math.abs(ny - centerY) > fieldHeight * 5 + 1e-7)
    )
      throw new Error(
        "Rounded DST movements exceed the selected hoop. Leave a small margin at the hoop boundary before export.",
      );
    const ox = x,
      oy = y,
      n = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(nx - x), Math.abs(ny - y)) / 121),
      );
    for (let i = 1; i <= n; i++) {
      const tx = Math.round(ox + ((nx - ox) * i) / n),
        ty = Math.round(oy + ((ny - oy) * i) / n);
      if (tx === x && ty === y && !jump) continue;
      records.push(...encodeDSTDelta(tx - x, ty - y, jump));
      x = tx;
      y = ty;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  };
  for (const s of splitMachineMoves(machineStream(project, plan, "dst"), 121)) {
    if (s.command === "color" || s.command === "stop") {
      records.push(0, 0, 0xc3);
      colors++;
    } else if (s.command === "trim") {
      const ox = x,
        oy = y,
        limit = check ? fieldWidth * 5 : 99999;
      if (ox + 2 <= centerX + limit && ox - 2 >= centerX - limit) {
        move(ox + 2, oy, true);
        move(ox - 2, oy, true);
        move(ox, oy, true);
      } else {
        const direction = ox > centerX ? -1 : 1;
        move(ox + direction * 2, oy, true);
        move(ox + direction, oy, true);
        move(ox, oy, true);
      }
    } else if (s.command === "sequin") {
      records.push(0, 0, 0x43);
      move(s.x, -s.y, true);
      records.push(0, 0, 0x43);
    } else move(s.x, -s.y, s.command === "jump");
  }
  if (
    Math.max(
      Math.abs(minX),
      Math.abs(maxX),
      Math.abs(minY),
      Math.abs(maxY),
      Math.abs(x),
      Math.abs(y),
    ) > 99999 ||
    colors > 999 ||
    records.length / 3 > 9999999
  )
    throw new Error(
      "Design exceeds DST header extent, colour-stop or record limits. Split the production design.",
    );
  const pad = (n: number, w: number) => String(n).padStart(w, " ");
  const label = project.name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .slice(0, 16)
    .padEnd(16, " ");
  const header = `LA:${label}\rST:${pad(records.length / 3, 7)}\rCO:${pad(colors, 3)}\r+X:${pad(Math.max(0, maxX), 5)}\r-X:${pad(Math.max(0, -minX), 5)}\r+Y:${pad(Math.max(0, maxY), 5)}\r-Y:${pad(Math.max(0, -minY), 5)}\rAX:${x < 0 ? "-" : "+"}${String(Math.abs(x)).padStart(5, " ")}\rAY:${y < 0 ? "-" : "+"}${String(Math.abs(y)).padStart(5, " ")}\rMX:+    0\rMY:+    0\rPD:******\r`;
  const result = new Uint8Array(512 + records.length + 3);
  result.fill(32, 0, 512);
  const bytes = text.encode(header);
  result.set(bytes, 0);
  result[bytes.length] = 0x1a;
  result.set(records, 512);
  result.set([0, 0, 0xf3], 512 + records.length);
  return result;
}
const escapeXML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function exportSVG(project: Project): string {
  const b = bounds(project.objects.flatMap(outlinePaths));
  const minX = project.workspaceMode === "freeform" ? Math.min(0, b.minX) : 0,
    minY = project.workspaceMode === "freeform" ? Math.min(0, b.minY) : 0;
  const width =
      (project.workspaceMode === "freeform"
        ? Math.max(project.width, b.maxX)
        : project.width) - minX,
    height =
      (project.workspaceMode === "freeform"
        ? Math.max(project.height, b.maxY)
        : project.height) - minY;
  const lines = project.objects.map((o) => {
    const d = outlinePaths(o)
      .map((path, i) =>
        path.length
          ? "M " +
            path.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" L ") +
            (o.closed[i] || ["satin-column", "column-c"].includes(o.type)
              ? " Z"
              : "")
          : "",
      )
      .join(" ");
    return `<path id="${escapeXML(o.id)}" aria-label="${escapeXML(o.name)}" d="${d}" fill="${LINE_TYPES.includes(o.type) && o.type !== "column-c" ? "none" : o.color}" fill-rule="${o.fillRule}"${LINE_TYPES.includes(o.type) && o.type !== "column-c" ? ` stroke="${o.color}" stroke-width="0.3"` : ""}/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="${minX} ${minY} ${width} ${height}">\n${lines.join("\n")}\n</svg>`;
}
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of data) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipFiles(
  files: { name: string; data: Uint8Array }[],
): Uint8Array {
  const chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    centralSize = 0;
  for (const file of files) {
    const name = text.encode(file.name),
      crc = crc32(file.data),
      local = new Uint8Array(30 + name.length),
      lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.data.length, true);
    lv.setUint32(22, file.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length),
      cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    chunks.push(local, file.data);
    central.push(cd);
    offset += local.length + file.data.length;
    centralSize += cd.length;
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}
export function exportBundle(project: Project, plan: StitchPlan): Uint8Array {
  const stem =
    project.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "embroidery";
  const rows = [
    "Sewing block,Object,Screen colour,Stitches,Brand,Thread range,Shade code,Shade name",
    ...plan.blocks.map((b, i) => {
      const o = project.objects.find((o) => o.id === b.objectId),
        t = o?.thread;
      return [
        String(i + 1),
        o?.name ?? "",
        b.color,
        String(b.stitchCount),
        t?.brand ?? "",
        t?.line ?? "",
        t?.code ?? "",
        t?.name ?? "",
      ]
        .map(csvCell)
        .join(",");
    }),
  ];
  const notes = `Threadform — experimental embroidery draft\n\nDesign: ${project.name}\nSize: ${project.width.toFixed(2)} × ${project.height.toFixed(2)} mm\nWorkspace: ${project.workspaceMode ?? "hoop"}\nHoop reference: ${project.hoopWidth} × ${project.hoopHeight} mm\nStart: ${project.autoStart ?? "center"} / End: ${project.autoEnd ?? "last"}\nMachine profile: ${project.machine?.name ?? "not specified"}\nFabric preset: ${project.fabric}\nPreview stitches: ${plan.stitchCount}\n\nDST positions are rounded to 0.1 mm. Machine trim behavior varies; this file uses three-jump trim sequences. DST does not store thread colours. Use the accompanying thread order and assign your physical threads on the machine. Screen colours are not calibrated thread matches.\n\nCheck the file in your machine software and sew a sample on the actual fabric, stabilizer, thread and needle before production. The preview displays planned paths and does not simulate fabric deformation.\n\nKeep the .threadform.json project for editable stitch settings. SVG stores vector outlines only.\n\n${[...project.notes, ...plan.issues.map((i) => i.message)].join("\n")}`;
  return zipFiles([
    { name: stem + ".dst", data: exportDST(project, plan) },
    {
      name: stem + ".threadform.json",
      data: text.encode(JSON.stringify(project, null, 2)),
    },
    { name: stem + ".svg", data: text.encode(exportSVG(project)) },
    { name: "thread-order.csv", data: text.encode(rows.join("\r\n")) },
    { name: "READ-ME.txt", data: text.encode(notes) },
  ]);
}
