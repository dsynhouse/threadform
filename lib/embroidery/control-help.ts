/** Plain-language help shared by hover, keyboard focus and touch help buttons. */
const HELP: [RegExp, string][] = [
  [
    /dimmed opacity/i,
    "Brightness of the reference image while Dim is enabled. Undim restores its original colours. This never changes embroidery thread colours or machine output.",
  ],
  [
    /artwork (x|y|width|height|rotation)/i,
    "Position, size or rotation of the original image behind your stitches. Unlock Reference artwork to edit these values. Physical fields follow your mm/in unit setting.",
  ],
  [
    /row spacing|stitch spacing|spacing|density/i,
    "Distance between stitch rows in millimetres. Smaller spacing adds stitches and thread coverage; inspect the density view and test on the intended fabric.",
  ],
  [
    /maximum satin|satin span/i,
    "Largest allowed satin rung. Auto-digitizing keeps wider areas in tatami. The actual machine’s maximum stitch length still applies.",
  ],
  [
    /satin layers/i,
    "Number of full satin passes. More passes add body and stitch count. Use narrow shapes and review thread buildup on a sew-out.",
  ],
  [
    /length/i,
    "Maximum distance between needle penetrations for this stitch method. Shorter stitches follow detail but increase stitch count. Satin uses its own span limit.",
  ],
  [
    /pull/i,
    "Extend stitches slightly across the fill direction to compensate for thread pull. This changes stitched coverage, not the editable source outline.",
  ],
  [
    /underlay inset/i,
    "Distance from the boundary to the underlay. Increase it to keep support stitches away from the finished edge.",
  ],
  [
    /underlay/i,
    "Support stitches sewn before the visible fill. Combine centre, edge, zigzag, double zigzag and tatami layers in sewing order to suit the shape and fabric.",
  ],
  [
    /cross grid/i,
    "Physical size of one cross-stitch cell. Stitches per inch = 25.4 divided by this size. All cells align to the same design grid.",
  ],
  [
    /cross.stitch order/i,
    "English completes each cross before moving on. Danish sews the lower legs along a row, then returns with the upper legs.",
  ],
  [
    /top diagonal/i,
    "Controls which diagonal is sewn last, so the finished crosses have a consistent direction.",
  ],
  [
    /cross repeats/i,
    "Repeat each diagonal to increase thread coverage. Repetition increases the number of penetrations in each cell.",
  ],
  [
    /stitch method|cross method/i,
    "Changes how the selected geometry becomes needle paths. The stitch library previews the same generators used for export.",
  ],
  [
    /angle/i,
    "Stitch direction in degrees. Paired satin rails define their own turning direction; change those rails with the Reshape tool.",
  ],
  [
    /pattern repeat|pattern size/i,
    "Physical size of the repeating motif. Smaller repeats create more pattern elements and a denser needle path.",
  ],
  [
    /effect width|column c width/i,
    "Width measured perpendicular to the path. Tight bends may cause overlaps when the width exceeds the bend radius.",
  ],
  [
    /contour tolerance/i,
    "Maximum contour simplification tolerance in millimetres. Small values retain more nodes. Pixel-detail protection rejects changes that lose source pixel coverage.",
  ],
  [
    /trace resolution/i,
    "Longest bitmap edge used for tracing. Higher resolution retains smaller features but needs more memory. Upscaling cannot restore missing source detail.",
  ],
  [
    /colour count/i,
    "Maximum number of colours used to partition the bitmap. Exact palettes override automatic palette selection.",
  ],
  [
    /opacity threshold/i,
    "Pixels with alpha below this value are excluded. Lower values include more semi-transparent edge pixels.",
  ],
  [
    /near.white threshold/i,
    "When near-white removal is enabled, pixels whose red, green and blue values all exceed this level are excluded.",
  ],
  [
    /discard detail|speck area/i,
    "Connected colour regions smaller than this pixel area are filtered. Low-contrast merge preserves a touching colour instead of creating a gap.",
  ],
  [
    /trace method/i,
    "Region mode traces filled contours and holes. Centreline mode follows thin line art as running paths; it has lower resolution and colour limits.",
  ],
  [
    /colour distance|colour difference/i,
    "A perceptual distance between screen colours. Lower thresholds retain more shades. CIEDE2000 improves the comparison across hues; it is not a physical thread calibration.",
  ],
  [
    /path connector|connect separate/i,
    "Auto sews short travel only when it stays inside the region. Jump leaves floating travel. Trim requests a cut before the next separate path.",
  ],
  [
    /auto start|auto end/i,
    "Choose where the exported machine program begins or ends. This origin is separate from the visible design area and machine field.",
  ],
  [
    /^artwork width$/i,
    "Physical width in the selected units, with no fixed maximum. Height follows the image proportions. You can also type 18in, 3/4in or 1200mm. Changing size does not require another trace.",
  ],
  [
    /width|height|position/i,
    "Physical dimensions in the selected units. Type an explicit mm or in suffix to override the display units. Freeform artwork may extend outside the design area; machine field checks are applied during export.",
  ],
  [
    /fabric/i,
    "Starting values for density and pull compensation. Actual results depend on the fabric, stabilizer, thread and machine; record a sew-out in Production.",
  ],
];
export function controlHelp(label: string) {
  return HELP.find(([pattern]) => pattern.test(label))?.[1];
}
