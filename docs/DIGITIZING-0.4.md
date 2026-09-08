# Threadform 0.4: digitizing and production preparation

This release expands the existing public studio. It remains a software preview: the implemented machine output is DST, and no specific machine model has been qualified by physical sew-out in this environment.

## Documented workflow and implementation

| Workflow              | Implemented behavior                                                                                                                | Limit                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Column A              | Alternate left/right corner or curve points; preserve the original rung correspondence when flattening                              | Curves become editable sampled geometry, not retained Bézier handles                             |
| Column B              | Digitize one edge, Enter, then the other edge; opposite orientations align automatically                                            | Rails correspond by normalized arc length, not semantic shape recognition                        |
| Column C              | Open or closed centreline, corner/curve digitizing, adjustable satin width and underlay                                             | Tight bends can create overlapping stitches; inspect before sewing                               |
| Right-click curves    | Left-click corner, right-click curve, Backspace removes a draft point, Enter finishes                                               | Manual needle-point input remains literal                                                        |
| Runs                  | Running, double, triple/bean, backstitch, stem, zigzag, blanket, chain effect, candlewick effect, coil and motif runs               | Chain, candlewick and coil are decorative lockstitch paths                                       |
| Filled stitching      | Tatami, parallel satin, paired turning satin, contour, wave, cross, motif, spiral, ripple, meander, coil and program split          | Decorative fills have explicit detail/work limits                                                |
| Program splits        | Seven choices including custom; penetration motifs tiled in the rotated fill plane                                                  | Long segments still obey the stitch-length limit                                                 |
| Custom patterns       | Draw up to 16 paths / 500 unit-square points; reuse in motif fill, motif run or program split                                       | A geometric tile, not a proprietary Wilcom pattern file                                          |
| Edge effects          | Deterministic feather/jagged variation inward from tatami/satin/program-split boundaries                                            | No outward expansion or fabric deformation simulation                                            |
| Connectors            | Auto contained travel, jump-between-paths or forced trim; object ties and project jump threshold remain editable                    | DST trims use a controller-dependent three-jump convention                                       |
| Freeform              | Artwork and stitch plans may extend beyond the artboard; SVG includes the expanded bounds                                           | Machine field enforcement is a separate export setting; editor resource limits remain            |
| Auto start/end        | Centre, first needle position or explicit origin; last stitch, return to start or explicit end                                      | Check physical frame travel; origins do not enlarge the machine field                            |
| View colours          | One/all-colour display filter; does not alter exported visibility                                                                   | Deliberately separate from hiding an object in the saved design                                  |
| Progression inspector | Exact command index, needle count, coordinates, deltas, lengths, object, underlay, jump/trim/colour navigation                      | Reports the planned sequence, not a connected machine's position                                 |
| Approval PDF          | Embedded fonts, fitted vector/stitch proof, thread sequence, notes, signatures; A4/Letter                                           | Does not certify sew-out quality; unsupported glyphs are explicitly identified                   |
| Actual-size print     | Tiled 1:1 mm pages, border registration marks and 20 mm scale reference                                                             | 64-page limit and bounded stitch rendering; print at 100%                                        |
| Thread directory      | Official Madeira, AMANN/Isacord, Robison-Anton, Gunold and Sulky references; CSV/GPL import, custom shades, search and ΔE76 ranking | Complete calibrated manufacturer-to-RGB databases are not bundled                                |
| DST import            | Read physical needle paths and colour blocks, reject malformed/truncated/specialty records                                          | Display colours are placeholders; original object types and trims cannot be recovered losslessly |
| DST export            | Quantized origin-aware moves, field/count checks and DST header limits; thread codes included in package CSV                        | No PES/JEF/EXP/VP3 encoder; no specialty hardware commands                                       |

## Vector tracing

The trace worker uses a five-bit RGB histogram, CIELAB colour-distance clustering, up to 64 colours and a maximum 2048-pixel longest edge. Users can supply exact six-digit hex values; matching exact source pixels retain those palette entries even when their values share a histogram bucket. Assigned palette colours are protected from automatic colour merging.

Minimum island area is applied to connected labels before boundary tracing, so removing a small outer island cannot leave an orphan hole. Interior holes are preserved by default, independently of island removal. Contour tolerance is expressed in millimetres. Thin holes that would collapse during simplification keep their original contours. Raster approximation, aliasing and simplification still require visual inspection of narrow features.

Optional centreline mode uses Zhang-Suen thinning and graph walking, with separate paths at branches and no diagonal shortcuts where an orthogonal route exists. It is limited to eight colours and 768 pixels. It is intended for line art; it does not infer lettering semantics or recover original vector curves from photographs.

## Data and architecture

New settings are optional fields of project version 1. The central validator accepts only known methods, bounded numeric properties, normalized custom tiles, finite start/end coordinates and bounded thread records. Existing projects remain readable. Geometry, machine serialization, tracing and PDFs remain independent of React. Expensive operations run in cancellable workers; font assets are served from the same public application origin.

Sew-out fingerprints include engine version 0.4 and all new stitch-affecting settings. A prior release's recorded pass does not qualify regenerated stitch data. Thread assignments retain original design hex colours by default; changing a screen swatch clears its previous physical-thread assignment. Optimization expands the spatial envelope of decorative runs so their width participates in ordering constraints. Feathered/gradient fills are not treated as opaque overlap cutters.

## Verification

`npm run check:digitizing` exercises every advertised stitch method, new clipped fills with holes, custom program split locations and coverage, columns, origin/end DST decoding, physical field checks, DST import failures, tiny-hole/exact-colour raster cases, centreline paths, thread chart parsing, schema round-trips and PDF pagination. The sample PDF is rendered with Poppler and visually inspected as a separate layout gate.

The existing 23 embroidery checks, 14 workshop checks and built-worker storage/HTML suite remain required. These checks do not replace actual browser interaction qualification, expert digitizing comparisons, independent machine-controller decoding or physical sew-outs.

## Primary references reviewed

- [Wilcom Column A: varying widths and paired corner/curve points](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Digitizing/input/Digitize_columns_of_varying_width.htm)
- [Wilcom Column B: independently digitized asymmetric edges](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Digitizing/input/Digitize_columns_of_turning_stitches.htm)
- [Wilcom Column C: fixed-width columns and borders](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-15.htm)
- [Wilcom feature comparison: fills, splits, connectors and digitizing](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Release/comparison/comparison-1.htm)
- [Madeira's complete published shade-card directory](https://www.madeira.com/hk-en/service/support/shade-cards)
- [AMANN's digital colour cards](https://www.amann.com/company/download-center/)
- [Robison-Anton embroidery shade brochure](https://www.amefird.com/wp-content/uploads/2018/08/AE-RA-Embroidery-Brochure.pdf)
- [Gunold colour charts](https://www.gunold.com/order-catalog-color-charts/)
- [Janome embroidery formats](https://www.janome.com/create-learn/janome-embroidery-formats/)
- [Brother machine manual with model-specific format requirements](https://download.brother.com/welcome/doch101715/882d83_om01en.pdf)

These documents describe capabilities and requirements, not evidence that Threadform reproduces proprietary algorithms or is qualified on every machine.
