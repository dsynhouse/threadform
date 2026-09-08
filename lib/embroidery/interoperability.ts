import { objectUnderlays } from "./underlay-settings";
import { exportSVG, zipFiles } from "./export";
import { fileHash } from "./file-hash";
import { isSewingObject } from "./sewing-input";
import { STITCH_NAMES, type Project, type StitchPlan } from "./types";

/** Open, versioned handoff data. This is deliberately not an EMB encoder or a
 * claim that Wilcom imports JSON object attributes. A licensed adapter must
 * translate these semantics using a documented Wilcom object-level interface. */
export function objectExchange(project: Project, plan?: StitchPlan | null) {
  const ranges = new Map<
    string,
    { start: number; end: number; kind: string }[]
  >();
  plan?.stitches.forEach((stitch, index) => {
    const list = ranges.get(stitch.objectId) ?? [];
    const kind = stitch.underlay
      ? `underlay:${stitch.underlayLayer ?? "legacy"}`
      : "cover-and-connectors";
    const tail = list.at(-1);
    if (tail && tail.kind === kind && tail.end === index) tail.end = index + 1;
    else list.push({ start: index, end: index + 1, kind });
    ranges.set(stitch.objectId, list);
  });
  return {
    schema:
      "https://github.com/dsynhouse/threadform/blob/main/docs/INTEROPERABILITY.md",
    schemaVersion: 1,
    application: "Threadform 0.10",
    units: "mm",
    axis: "x right, y down",
    conversion: {
      format: "Threadform object exchange",
      nativeEMB: false,
      licensedWilcomAdapter: "required",
      recognitionVerifiedInWilcom: false,
    },
    sourceArtwork: { embedded: false, reference: project.artwork ?? null },
    objects: project.objects.map((object, index) => ({
      id: object.id,
      sewingOrder: index,
      name: object.name,
      sewEnabled: isSewingObject(object),
      inputMethod:
        object.columnKind ??
        (object.type === "satin-column"
          ? "A"
          : object.type === "column-c"
            ? "C"
            : "outline"),
      coverMethod: ["satin-column", "column-c"].includes(object.type)
        ? "satin"
        : object.type,
      coverLabel: STITCH_NAMES[object.type],
      paths: object.paths,
      closed: object.closed,
      fillRule: object.fillRule,
      underlayEnabled: object.underlay,
      underlays: objectUnderlays(object),
      thread: object.thread ?? null,
      artworkRGB: object.color,
      // The full source preserves effects, curves, ties, compensation, pauses,
      // entry/exit points and unknown future settings without lossy remapping.
      parameters: object,
      commandRanges: ranges.get(object.id) ?? [],
    })),
  };
}

export function exportObjectExchange(
  project: Project,
  plan?: StitchPlan | null,
) {
  const enc = new TextEncoder();
  const stem =
    project.name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "embroidery";
  const files = [
    {
      name: stem + ".threadform.json",
      data: enc.encode(JSON.stringify(project)),
    },
    { name: stem + ".svg", data: enc.encode(exportSVG(project)) },
    {
      name: "object-map.json",
      data: enc.encode(JSON.stringify(objectExchange(project, plan), null, 2)),
    },
  ];
  if (plan)
    files.push({
      name: "needle-paths.json",
      data: enc.encode(
        JSON.stringify({ units: "mm", commands: plan.stitches }),
      ),
    });
  files.push({
    name: "checksums.json",
    data: enc.encode(
      JSON.stringify(
        Object.fromEntries(
          files.map((file) => [file.name, fileHash(file.data)]),
        ),
        null,
        2,
      ),
    ),
  });
  files.push({
    name: "WILCOM-HANDOFF.txt",
    data: enc.encode(
      "This package is NOT an EMB file.\n\nOpen its SVG as artwork in Wilcom. It contains outlines, not native embroidery objects. The Threadform JSON is the editable master for this app. object-map.json records input A/B/C, cover methods, ordered underlays, thread codes, geometry and stitch-command ranges for a future licensed object converter. Wilcom does not automatically consume these JSON settings.\n\nFor exact editable EMB interoperability, an authorized Wilcom integration must create objects through its documented interface, save EMB, then reopen it in the target EmbroideryStudio version and verify type, rails, curves, underlays, compensation, threads and sewing order. No such converter is configured or qualified in this release. Renaming a stitch file to .EMB does not do this.\n\nMachine files exported separately preserve needle commands. Wilcom stitch recognition may reconstruct Satin/Tatami/Program Split, but can split regions or classify unfamiliar paths as manual stitches. Compare an unchanged stitch import and a recognized copy separately. Do not certify object fidelity from a stitch count alone.\n\nOriginal source bitmap bytes are not embedded here. Their asset reference and conversion settings remain in the project; retain the original image or use its cloud/local saved copy.\n\nhttps://developer.wilcom.com/\nhttps://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Production/convert/Object_recognition.htm\n",
    ),
  });
  return zipFiles(files);
}
