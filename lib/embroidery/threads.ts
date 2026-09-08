import type { ThreadShade } from "./types";
import { validateThread } from "./project";
export const THREAD_DIRECTORIES = [
  {
    brand: "AMANN / Isacord",
    ranges: "Isacord digital colour card and AMANN thread documentation",
    url: "https://www.amann.com/company/download-center/",
  },
  {
    brand: "Robison-Anton",
    ranges:
      "Super Strength Rayon · Super Brite Polyester · official embroidery shade brochure",
    url: "https://www.amefird.com/wp-content/uploads/2018/08/AE-RA-Embroidery-Brochure.pdf",
  },
  {
    brand: "Madeira",
    ranges:
      "Classic rayon · Polyneon · Polyneon Green · Frosted Matt · Metallics · Burmilana · Sensa Green · Chenille",
    url: "https://www.madeira.com/embroidery-solutions/service/support/shade-cards",
  },
  {
    brand: "Gunold",
    ranges: "Poly polyester · Sulky rayon · thread conversion charts",
    url: "https://www.gunold.com/order-catalog-color-charts/",
  },
  {
    brand: "Sulky",
    ranges: "Rayon · polyester · cotton · metallic thread charts",
    url: "https://sulky.com/thread/thread-charts/",
  },
];
/** RFC 4180 fields, escaped quotes, CRLF and newlines inside quoted fields. */
export function parseCSV(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === '"') {
      if (field.length || closed) throw new Error("Invalid CSV quoting.");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && source[i + 1] === "\n") i++;
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (closed && c.trim())
        throw new Error("Unexpected text after a quoted CSV field.");
      if (!closed) field += c;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quote.");
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function importThreadLibrary(
  source: string,
  fileName = "Custom",
): ThreadShade[] {
  if (source.length > 2 * 1024 * 1024)
    throw new Error("Thread chart must be smaller than 2 MB.");
  if (source.replace(/^\uFEFF/, "").startsWith("GIMP Palette")) {
    const brand = fileName.replace(/\.[^.]+$/, "").slice(0, 100);
    const shades = source.split(/\r?\n/).flatMap((line) => {
      const m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+(.+)$/);
      if (!m) return [];
      const rgb = m.slice(1, 4).map(Number);
      if (rgb.some((c) => c > 255))
        throw new Error("Invalid RGB value in palette.");
      const label = m[4].trim(),
        code = label.match(/^([\w-]+)/)?.[1] ?? "";
      return [
        validateThread({
          brand,
          line: "Imported palette",
          code,
          name: label,
          color: "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join(""),
        }),
      ];
    });
    if (!shades.length) throw new Error("The chart contains no thread shades.");
    return shades;
  }
  const rows = parseCSV(source.replace(/^\uFEFF/, ""));
  const headers = rows.shift()?.map((s) => s.trim().toLowerCase()) ?? [];
  const color =
    headers.indexOf("color") >= 0
      ? headers.indexOf("color")
      : headers.indexOf("hex");
  if (color < 0)
    throw new Error(
      "CSV needs a color or hex column. Optional columns: brand, line, code, name.",
    );
  const shades = rows.map((row) => {
    const record: Record<string, unknown> = { color: row[color]?.trim() };
    for (const key of ["brand", "line", "code", "name"]) {
      const i = headers.indexOf(key);
      record[key] =
        i >= 0
          ? (row[i]?.trim() ?? "")
          : key === "brand"
            ? fileName.replace(/\.[^.]+$/, "")
            : "";
    }
    for (const key of [
      "source",
      "measuredAt",
      "instrument",
      "lot",
      "illuminant",
      "observer",
    ]) {
      const i = headers.indexOf(key.toLowerCase());
      if (i >= 0 && row[i]?.trim()) record[key] = row[i].trim();
    }
    const lab = ["l", "a", "b"].map((key) => headers.indexOf("lab_" + key));
    if (lab.every((i) => i >= 0) && lab.some((i) => row[i]?.trim()))
      record.measuredLab = lab.map((i) =>
        row[i]?.trim() ? Number(row[i].trim().replace(/^'(?=-?\d)/, "")) : NaN,
      );
    return validateThread(record);
  });
  if (!shades.length) throw new Error("The chart contains no thread shades.");
  return shades;
}
export const csvCell = (s: string) =>
  '"' + (/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"';
export function exportThreadLibrary(shades: ThreadShade[]): string {
  return [
    "brand,line,code,name,color,source,lab_l,lab_a,lab_b,illuminant,observer,measuredAt,instrument,lot",
    ...shades.map((t) =>
      [
        t.brand,
        t.line,
        t.code,
        t.name,
        t.color,
        t.source ?? "",
        ...(t.measuredLab?.map(String) ?? ["", "", ""]),
        t.illuminant ?? "",
        t.observer ?? "",
        t.measuredAt ?? "",
        t.instrument ?? "",
        t.lot ?? "",
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}
export function mergeThreadLibraries(
  a: ThreadShade[],
  b: ThreadShade[],
): ThreadShade[] {
  const map = new Map(
    a.map((t) => [[t.brand, t.line, t.code, t.name].join("\u0000"), t]),
  );
  for (const t of b)
    map.set([t.brand, t.line, t.code, t.name].join("\u0000"), t);
  return [...map.values()];
}
