import { objectExchange } from "./interoperability";
import type { Project, StitchPlan } from "./types";
import { exportDST, exportSVG, zipFiles } from "./export";
import {
  machineStream,
  splitMachineMoves,
  type MachineFormat,
  type MachineRecord,
} from "./machine-stream";
import { JEF_PALETTE, PEC_PALETTE } from "./format-palettes";
import { colorDifference } from "./optimization";
import { csvCell } from "./threads";
import { fileHash } from "./file-hash";

// PES/PEC and JEF layout references: pyembroidery 1.5.1 (MIT).
// Browser-native writers. No conversion service or extension renaming.
class Binary {
  data: number[] = [];
  u8(...values: number[]) {
    for (const v of values) this.data.push(v & 255);
  }
  u16(v: number) {
    this.u8(v, v >>> 8);
  }
  u24(v: number) {
    this.u8(v, v >>> 8, v >>> 16);
  }
  u32(v: number) {
    this.u8(v, v >>> 8, v >>> 16, v >>> 24);
  }
  f32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this.bytes(b);
  }
  bytes(v: Iterable<number>) {
    for (const n of v) this.u8(n);
  }
  ascii(v: string) {
    this.bytes(new TextEncoder().encode(v.replace(/[^\x20-\x7e\r]/g, " ")));
  }
  zero(n: number) {
    for (let i = 0; i < n; i++) this.u8(0);
  }
  patch(at: number, v: number, n = 4) {
    for (let i = 0; i < n; i++) this.data[at + i] = (v >>> (i * 8)) & 255;
  }
  finish() {
    return Uint8Array.from(this.data);
  }
}
type Palette = ({ color: string; name: string; code: string } | null)[];
function colorSequence(records: MachineRecord[]) {
  const colors = [records[0]?.color ?? "#000000"];
  for (const r of records)
    if (r.command === "color" || r.command === "stop") colors.push(r.color);
  return colors;
}
function paletteIndices(
  colors: string[],
  palette: Palette,
  records: MachineRecord[],
) {
  const pauses = [
    false,
    ...records
      .filter((r) => r.command === "color" || r.command === "stop")
      .map((r) => r.command === "stop"),
  ];
  let previous = -1,
    previousColor = "";
  return colors.map((color, sequenceIndex) => {
    const ranked = palette
      .flatMap((t, index) =>
        t ? [{ index, d: colorDifference(color, t.color) }] : [],
      )
      .sort((a, b) => a.d - b.d);
    // Distinct adjacent design colours must not decode as duplicate-colour pauses.
    const index = ranked.find(
      (t) =>
        (pauses[sequenceIndex] && color === previousColor) ||
        t.index !== previous,
    )!.index;
    previous = index;
    previousColor = color;
    return index;
  });
}
function extents(records: MachineRecord[]) {
  let minX = 0,
    minY = 0,
    maxX = 0,
    maxY = 0;
  for (const r of records) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x);
    maxY = Math.max(maxY, r.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
export function exportEXP(project: Project, plan: StitchPlan): Uint8Array {
  const records = splitMachineMoves(machineStream(project, plan, "exp"), 127),
    b = new Binary();
  let x = 0,
    y = 0;
  for (const r of records) {
    if (r.command === "trim") b.u8(0x80, 0x80, 7, 0);
    else if (r.command === "color" || r.command === "stop") b.u8(0x80, 1, 0, 0);
    else {
      if (r.command === "jump") b.u8(0x80, 4);
      b.u8(r.x - x, y - r.y);
      x = r.x;
      y = r.y;
    }
  }
  return b.finish(); // EXP terminates at EOF.
}
export function exportJEF(project: Project, plan: StitchPlan): Uint8Array {
  const records = splitMachineMoves(machineStream(project, plan, "jef"), 127),
    e = extents(records);
  const hoops = [
    { w: 500, h: 500, id: 1 },
    { w: 1100, h: 1100, id: 0 },
    { w: 1260, h: 1100, id: 3 },
    { w: 1400, h: 2000, id: 2 },
    { w: 2000, h: 2000, id: 4 },
  ];
  const hoop = hoops.find(
    (h) =>
      Math.max(-e.minX, e.maxX) <= h.w / 2 &&
      Math.max(-e.minY, e.maxY) <= h.h / 2,
  );
  if (!hoop)
    throw new Error(
      "JEF v1 export requires a supported 50×50, 110×110, 126×110, 140×200 or 200×200 mm field around the start origin. Reposition or split the design.",
    );
  const colors = colorSequence(records),
    palette = paletteIndices(colors, JEF_PALETTE, records);
  if (colors.length > 256)
    throw new Error("JEF export supports at most 256 thread/pause entries.");
  let color = 0;
  for (const r of records)
    if (r.command === "color" || r.command === "stop") {
      color++;
      if (r.command === "stop") palette[color] = 0;
    }
  const body = new Binary();
  let x = 0,
    y = 0;
  for (const r of records) {
    if (r.command === "trim")
      for (let i = 0; i < 3; i++) body.u8(0x80, 2, 0, 0);
    else if (r.command === "color" || r.command === "stop")
      body.u8(0x80, 1, 0, 0);
    else {
      if (r.command === "jump") body.u8(0x80, 2);
      body.u8(r.x - x, y - r.y);
      x = r.x;
      y = r.y;
    }
  }
  body.u8(0x80, 0x10);
  const b = new Binary();
  b.u32(0x74 + 8 * colors.length);
  b.u32(0x14);
  b.ascii("20260907000000");
  b.zero(2);
  b.u32(colors.length);
  b.u32(body.data.length / 2);
  b.u32(hoop.id);
  b.u32(-e.minX);
  b.u32(-e.minY);
  b.u32(e.maxX);
  b.u32(e.maxY);
  for (const h of [
    { w: 1100, h: 1100 },
    { w: 500, h: 500 },
    { w: 1400, h: 2000 },
    hoop,
  ]) {
    const margins = [
      h.w / 2 + e.minX,
      h.h / 2 + e.minY,
      h.w / 2 - e.maxX,
      h.h / 2 - e.maxY,
    ];
    for (const m of margins) b.u32(margins.some((v) => v < 0) ? -1 : m);
  }
  palette.forEach((i) => b.u32(i));
  palette.forEach(() => b.u32(0x0d));
  b.bytes(body.data);
  return b.finish();
}
function pecValue(b: Binary, value: number, flag = 0) {
  if (!flag && value >= -63 && value <= 62) b.u8(value & 127);
  else {
    const v = (value & 0xfff) | 0x8000 | (flag << 8);
    b.u8(v >>> 8, v);
  }
}
function pecBlock(
  project: Project,
  records: MachineRecord[],
  palette: number[],
): Uint8Array {
  const b = new Binary(),
    e = extents(records);
  b.ascii(
    "LA:" +
      project.name
        .replace(/[^\x20-\x7e]/g, " ")
        .slice(0, 16)
        .padEnd(16) +
      "\r",
  );
  for (let i = 0; i < 12; i++) b.u8(32);
  b.u8(255, 0, 6, 38);
  for (let i = 0; i < 12; i++) b.u8(32);
  b.u8(palette.length - 1);
  b.bytes(palette);
  while (b.data.length < 512) b.u8(32);
  const start = b.data.length;
  b.zero(5);
  b.u8(0x31, 255, 0xf0);
  b.u16(e.width);
  b.u16(e.height);
  b.u16(0x1e0);
  b.u16(0x1b0);
  let x = 0,
    y = 0,
    toggle = 2;
  for (const r of records) {
    if (r.command === "color" || r.command === "stop") {
      b.u8(0xfe, 0xb0, toggle);
      toggle = toggle === 2 ? 1 : 2;
    } else if (r.command === "trim") {
      pecValue(b, 0, 0x20);
      pecValue(b, 0, 0x20);
    } else {
      const flag = r.command === "jump" ? 0x10 : 0;
      pecValue(b, r.x - x, flag);
      pecValue(b, r.y - y, flag);
      x = r.x;
      y = r.y;
    }
  }
  b.u8(255);
  b.patch(start + 2, b.data.length - start, 3);
  // Controller thumbnails: overall image and each colour block, 48 by 38 one-bit pixels.
  const graphics = Array.from(
    { length: palette.length + 1 },
    () => new Uint8Array(6 * 38),
  );
  let block = 1;
  const scale = Math.min(42 / Math.max(1, e.width), 32 / Math.max(1, e.height));
  for (const r of records) {
    if (r.command === "color" || r.command === "stop") {
      block++;
      continue;
    }
    if (r.command !== "stitch") continue;
    const px = Math.max(
        0,
        Math.min(47, Math.round(24 + (r.x - (e.minX + e.maxX) / 2) * scale)),
      ),
      py = Math.max(
        0,
        Math.min(37, Math.round(19 + (r.y - (e.minY + e.maxY) / 2) * scale)),
      );
    graphics[0][py * 6 + (px >> 3)] |= 1 << (px & 7);
    graphics[block][py * 6 + (px >> 3)] |= 1 << (px & 7);
  }
  graphics.forEach((g) => b.bytes(g));
  return b.finish();
}
export function exportPES(project: Project, plan: StitchPlan): Uint8Array {
  const records = splitMachineMoves(machineStream(project, plan, "pes"), 2047),
    e = extents(records),
    colors = colorSequence(records);
  if (colors.length > 255)
    throw new Error("PES v1 supports at most 255 thread/pause entries.");
  if (e.width > 32767 || e.height > 32767)
    throw new Error("PES signed segment extents exceeded.");
  const palette = paletteIndices(colors, PEC_PALETTE, records),
    b = new Binary();
  b.ascii("#PES0001");
  b.u32(0);
  b.u16(1);
  b.u16(1);
  b.u16(1);
  b.u16(0xffff);
  b.u16(0);
  b.u16(7);
  b.ascii("CEmbOne");
  b.zero(16);
  [1, 0, 0, 1, 1000 - e.width / 2, 1000 + e.height / 2].forEach((n) =>
    b.f32(n),
  );
  b.u16(1);
  b.u16(0);
  b.u16(0);
  b.u16(e.width);
  b.u16(e.height);
  b.zero(8);
  const sectionAt = b.data.length;
  b.u16(0);
  b.u16(0xffff);
  b.u16(0);
  b.u16(7);
  b.ascii("CSewSeg");
  const segments: { flag: number; color: number; points: MachineRecord[] }[] =
    [];
  let ci = 0;
  for (const r of records) {
    if (r.command === "color" || r.command === "stop") {
      ci++;
      continue;
    }
    if (r.command !== "stitch" && r.command !== "jump") continue;
    const flag = r.command === "jump" ? 1 : 0,
      last = segments.at(-1);
    if (
      last &&
      last.flag === flag &&
      last.color === ci &&
      last.points.length < 65535
    )
      last.points.push(r);
    else segments.push({ flag, color: ci, points: [r] });
  }
  if (segments.length > 65535)
    throw new Error("PES segment limit exceeded. Split the design.");
  b.patch(sectionAt, segments.length, 2);
  const log: { section: number; color: number }[] = [];
  let lastColor = -1;
  segments.forEach((s, i) => {
    if (i) b.u16(0x8003);
    b.u16(s.flag);
    b.u16(palette[s.color]);
    b.u16(s.points.length);
    for (const p of s.points) {
      b.u16(p.x - e.minX);
      b.u16(p.y - e.maxY);
    }
    if (s.color !== lastColor) {
      log.push({ section: i, color: palette[s.color] });
      lastColor = s.color;
    }
  });
  b.u16(log.length);
  log.forEach((l) => {
    b.u16(l.section);
    b.u16(l.color);
  });
  b.zero(4);
  b.patch(8, b.data.length);
  b.bytes(pecBlock(project, records, palette));
  return b.finish();
}
export function exportNative(
  project: Project,
  plan: StitchPlan,
  format: MachineFormat,
): Uint8Array {
  return { dst: exportDST, pes: exportPES, jef: exportJEF, exp: exportEXP }[
    format
  ](project, plan);
}
export async function exportMachineBundle(
  project: Project,
  plan: StitchPlan,
  format: MachineFormat,
): Promise<Uint8Array> {
  const data = exportNative(project, plan, format),
    stem =
      project.name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "embroidery";
  const sha256 = fileHash(data);
  const enc = new TextEncoder(),
    manifest = {
      format,
      writer: "Threadform 0.10",
      sha256,
      bytes: data.length,
      generatedAt: new Date().toISOString(),
      machine: project.machine ?? null,
      physicalQualification: "Not certified by this export",
      units: "0.1 mm",
      pauses: project.objects.filter((o) => o.pauseAfter).map((o) => o.name),
    };
  const rows = [
    "Object,Hex,Brand,Range,Code,Pause after",
    ...plan.blocks.map((b) => {
      const o = project.objects.find((o) => o.id === b.objectId);
      return [
        o?.name ?? "",
        b.color,
        o?.thread?.brand ?? "",
        o?.thread?.line ?? "",
        o?.thread?.code ?? "",
        o?.pauseAfter ? "Yes" : "No",
      ]
        .map(csvCell)
        .join(",");
    }),
  ];
  const wilcom = `OPENING IN WILCOM\n\nOpen the .${format} machine file extracted from this package. The SVG is vector artwork, not a machine stitch file.\n\nTo compare the generated needle paths: in Open > Options, disable Objects/Outlines and Automatic Connectors. For DST, recognize 3 consecutive jumps as a trim. Inspect at the exported physical dimensions.\n\nTo reconstruct editable fill objects: open another copy with Objects/Outlines enabled, and review Tatami recognition's stitch spacing and minimum length ranges. Reconstruction may split regions into several objects. Machine formats do not carry Threadform's editable tatami settings or native Wilcom EMB objects. Keep the .threadform.json project for resizing and regeneration.\n\nSpacing in Threadform is the distance between adjacent fill rows. Check how the selected Wilcom stitch/backstitch mode defines spacing before re-entering values.\n\nhttps://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Production/convert/Open_machine_files.htm\nhttps://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Production/convert/convert-5.htm\n`;
  return zipFiles([
    { name: stem + "." + format, data },
    {
      name: stem + ".threadform.json",
      data: enc.encode(JSON.stringify(project)),
    },
    { name: stem + ".svg", data: enc.encode(exportSVG(project)) },
    {
      name: "manifest.json",
      data: enc.encode(JSON.stringify(manifest, null, 2)),
    },
    {
      name: "object-map.json",
      data: enc.encode(JSON.stringify(objectExchange(project, plan), null, 2)),
    },
    { name: "thread-order.csv", data: enc.encode(rows.join("\r\n")) },
    { name: "WILCOM-IMPORT.txt", data: enc.encode(wilcom) },
    {
      name: "READ-ME.txt",
      data: enc.encode(
        "Verify the exact model, firmware, sewing field and setup. PES/JEF palette colours are approximations; use thread-order.csv. DST and EXP carry no RGB palette. Pauses in DST/EXP use colour-stop commands: configure the controller to pause and retain the same thread. DST and JEF trims use three jumps; confirm controller trim settings. Sequin DST requires the selected single-sequin device. Record a sew-out and the file SHA-256 before production. No physical machine has been certified by this package.",
      ),
    },
  ]);
}
