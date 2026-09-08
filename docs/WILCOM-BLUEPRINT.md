# Threadform: reference workflow and implementation blueprint

The current v0.5 implementation, keyboard mapping and research decisions are documented in [DIGITIZING-0.5.md](DIGITIZING-0.5.md). Version 0.4 digitizing and machine requirements remain in [DIGITIZING-0.4.md](DIGITIZING-0.4.md). The sections below retain the earlier research context.

Reference review: 7 September 2026. This document separates documented Wilcom concepts from Threadform's original implementation and planned engineering. Threadform is an independent product; Wilcom software, proprietary fonts, branding and internal algorithms are not bundled.

## Workflow reference

Wilcom models embroidery as editable objects with geometry and stitch properties. Threadform follows that object-based structure: import or draw geometry, assign a stitch method, set dimensions and properties, sequence the objects, inspect generated stitches, export, and test on fabric. [Wilcom object digitizing](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-1.htm)

The input workflow distinguishes open outlines, closed areas and columns. Threadform exposes separate line, polygon, smooth contour and paired-column tools, then keeps properties alongside the canvas. [Wilcom digitizing methods](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Digitizing/input/Digitizing_methods.htm)

The core lockstitch families are run, satin and tatami. Decorative styles build on their needle movements. Threadform's labels describe its own implemented generators and do not assert identical output to a Wilcom stitch effect. [Wilcom glossary](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/glossary/glossary.htm)

## Current capabilities and remaining work

| Workflow / family      | Threadform 0.3                                                                                                                              | Further engineering for professional parity                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Artwork preparation    | SVG import; PNG/JPG/WebP reduction and tracing; original/vector review; physical scale; integer polygon Boolean operations                  | Perceptual raster quantization, semantic segmentation and editable curve primitives                                     |
| Element breakdown      | Connected regions retaining holes; object list, locks/groups; selected solid-fill overlap removal with edge allowance                       | Foreground/background classification and material-aware overlap allowances                                              |
| Colour breakdown       | Coverage/stitches/path length; exact hex locks; opt-in CIELAB ΔE76 merging with explicit source/target table                                | Licensed thread charts, calibrated manufacturer matching and consumption models                                         |
| Run family             | Single run, triple/bean, backstitch, zigzag, blanket/E and explicit needle points                                                           | Optimized redwork branching, automatic shortest continuous paths, smart stitch shortening                               |
| Satin                  | Parallel scanline satin; manually paired turning rails; long-span splitting; centre, edge or zigzag column underlay                         | Automatic rail extraction, rail self-intersection repair and variable edge shortening                                   |
| Area fills             | Adjustable tatami stagger, wave, cross, motif, contour offsets, linear density gradients and complementary two-colour shading               | Turning complex fills, programmed splits, stipple and arbitrary multilayer blend editing                                |
| Stabilization          | True polygon-inset sparse/crossed/edge underlay; fabric starting presets; directional pull extension                                        | Calibrated settings by fabric/thread/stabilizer; geometric push compensation                                            |
| Drawing                | Polygon, smooth contour, primitives, freehand, holes and satin rails; straight Knife and 3 mm swept Eraser                                  | Full Bézier handles, variable brush width/pressure, tablet validation                                                   |
| Editing                | Direct resize/rotation handles; arrow-key moves; node edits; undo/redo; weld, subtract, intersect, XOR, offset, border and simplify preview | Continuous redwork branching, exact geometric constraints, keyboard node nudging                                        |
| Creative tools         | Motifs, palette studies, repeats, monoline alphabet, density-budgeted shading, appliqué placement/tack/cover objects and 1:1 cutting SVG    | Embroidery fonts, lettering envelopes, machine-controlled appliqué stops and custom motif authoring                     |
| Sequencing and preview | Constraint-aware colour grouping; nearby entries; reversible open runs; trim threshold/locks; before/after paths and metrics                | Globally optimal sequencing, arbitrary entry/exit placement, travel under later coverage and fabric deformation preview |
| Saving                 | Durable private browser studios; optimistic concurrency; immutable project snapshots; history; JSON portability                             | Optional account-based cross-device recovery, storage retention policy and audited recovery tools                       |
| Machine output         | DST, thread order, SVG, project and notes in ZIP; geometric checks; version-linked sew-out records                                          | PES/JEF/EXP compatibility, native project format SDKs, machine-specific trims and stops                                 |
| Specialty              | Editable appliqué preparation with forced trims; manual machine pause documented; cutting outlines                                          | Machine stops, multi-hooping, sequins, beads, chenille, multi-decoration and machine connectivity                       |

Wilcom's product comparison documents motifs, specialty embroidery and lettering capabilities; those entries guide the remaining scope above. [Wilcom product comparison](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Release/comparison/comparison-1.htm)

Wilcom's current product material includes turning complex fill, automated artwork digitizing and more elaborate creative effects. Threadform's current rule-based suggestions do not yet reproduce that level of automation. [EmbroideryStudio](https://wilcom.com/embroiderystudio), [Designing](https://wilcom.com/embroiderystudio/designing)

## Accuracy model

- Geometry is stored in millimetres. The SVG importer flattens supported curves at a nominal 0.06 mm tolerance, accounting for transforms.
- Raster tracing is an approximation of sampled pixels; controls expose palette size, sampling resolution and discarded detail area. White removal and alpha thresholds are stated in the interface.
- Separating compound artwork preserves hole ownership. Same-winding nonzero SVG compounds stay together rather than being incorrectly split.
- Generated stitches drive both canvas simulation and export. DST quantizes coordinates to 0.1 mm and does not encode RGB thread colours.
- Decorative segments are clipped to original contours; short travel between decorative regions also respects holes. Pull extension applies to tatami, parallel satin and paired satin rails.
- Sew-out results are user records associated with a fingerprint of stitch-affecting design properties. Changing a design cannot automatically carry forward a previous pass. A recorded pass is not software certification.
- Current ceilings are 400 objects, 150,000 total project points and 350,000 stitch commands. Workers cancel obsolete jobs and bound execution time. Complex decorative operations have a work estimate limit.
- Boolean operations use pinned Clipper 6.4.2 at 0.001 mm integer resolution, independently normalizing each operand's fill rule. Offset arcs have nominal 0.025 mm approximation tolerance. The worker accepts at most 40,000 selected points per geometry edit and is terminated after 25 seconds. This precision describes geometry, not achievable stitch/fabric accuracy. [Clipper documentation](https://github.com/junmer/clipper-lib/blob/master/Documentation.md)
- Knife uses an infinite straight cut through the selection. Erase subtracts a round-capped 3 mm stroke. Both preserve holes; cuts to paired satin rails become parallel-satin fragments because new rail correspondence cannot be inferred safely.
- Overlap removal considers later selected solid fills only. Gradient and decorative fills never erase lower objects. The allowance is geometric and still needs material-specific sew-out adjustment.
- Sequencing uses a greedy topological order with conservative expanded bounding boxes. It preserves all possible stitched overlaps, absolute locked-object barriers and relative group order. Bounding boxes can retain more constraints than necessary; the solver does not promise a global minimum. Reversals are restricted to single open run/bean paths without direction locks.
- Colour merging is off by default. It maps directly to retained original colours within an explicit ΔE76 threshold, without transitive merge chains. Object locks and exact-colour locks protect their swatches. This is not manufacturer thread matching or colour calibration.
- Short same-colour jumps may omit a trim up to a chosen threshold; tie stitches remain and the connector is still a jump. Forced object trims, colour transitions and final trims are retained. Metrics include initial travel from the design centre.
- Two-colour shading creates two editable tatami objects. Their complementary linear density profiles sum to a nominal 1/0.45 rows per millimetre. Actual sampled row positions, ties, overlap and underlay still affect local density.
- Sew-out fingerprints now include the stitch-engine revision as well as stitch-affecting settings. A software regeneration change cannot inherit a prior release's recorded pass.

## Advanced Wilcom workflows reviewed for this release

Wilcom documents closest joins, branching, entry/exit edits, tatami offsets, custom splits, contour and offset fills. Threadform's optimizer combines overlap-order protection and explicit before/after review; its run reversal is not a continuous branching engine. [Wilcom feature comparison](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Release/comparison/comparison-1.htm)

Wilcom's own closest-join documentation distinguishes run-end swapping from the more capable branching workflow and identifies regeneration limits for manually edited or recognized stitches. Threadform consequently leaves manual needle paths out of automatic reversal. [Closest-join limitations](https://docs.wilcom.com/be-embroiderystudio/27/en/OnlineHelp2/Quality/connectors/connectors-19.htm)

Wilcom's current Multi Blend layers colours, stitch styles and effects within one editable object. Threadform's two-colour shading is a smaller original implementation focused on an inspectable combined density budget; it does not reproduce Multi Blend's full feature set. [Wilcom Multi Blend](https://wilcom.com/resources/blog/wilcoms-multi-blend)

Wilcom also demonstrates vector cut-line generation for appliqué and cutting workflows. Threadform provides physical SVG outlines and separate editable preparation passes; the SVG contains no machine power or tool settings. [Wilcom cut-line workflow](https://wilcom.com/resources/blog/creating-a-vector-cut-line-from-an-embroidery-design-video)

## Where to pursue an advantage

| Product opportunity         | Implemented foundation                                                                           | Evidence needed for a stronger claim                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Explainable automation      | Original/proposed paths, exact colour mapping, actual command metrics and reversible application | Expert timing study comparing correction effort and finished sew-outs            |
| Colour intent               | Exact swatch locks, opt-in similarity thresholds, colour-to-object mapping                       | Calibrated physical thread charts and fabric-specific colour measurements        |
| Material-aware quality      | Editable stabilization, explicit overlap allowance, engine-linked sew-out history                | Labeled sew-out corpus and measured distortion/coverage models                   |
| Creative access             | Public studio, physical units, bitmap/vector pipeline, editable repeats and shading              | Browser/tablet qualification, larger-design benchmarks and cross-device recovery |
| Production interoperability | Shared stitch plan for preview and DST, portable editable JSON and cutting SVG                   | Independent machine decoders, PES/JEF/EXP coverage and approved machine profiles |

The development goal is a more transparent and expressive workflow. Superiority to Wilcom and production readiness require comparative evidence and machine qualification; the current feature set alone cannot establish either.

Fabric and hooping affect pull and coverage. Presets are starting values that require physical testing. [Wilcom pull compensation](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Quality/stabilizing/stabilizing-17.htm)

## Optional licensed auto-digitizing provider

Wilcom documents bitmap and vector auto-digitizing endpoints, including `bitmapArtDesign`, `vectorArtDesign` and TrueView variants. A licensed provider adapter could accelerate professional-quality automation while retaining Threadform's editor. It is not configured in this build. Evaluate permitted use, file interchange, cost and material-specific output quality before integration. [Wilcom auto-digitizing API concepts](https://help.wilcom.com/portal/en/kb/wilcom-international/embroidery-web-api/faqs/articles/autodigitizing-concept)

## Inspiration connections

The public inspiration workspace opens searches on Pinterest, Behance, Dribbble and The Met. Local reference records preserve source URLs, notes, tags, uploaded previews and extracted palettes. These searches are external links, not scraped feeds.

Pinterest integration code uses its official OAuth flow and read-only board/pin permissions. App credentials and authorization are required before live board import. [Pinterest authorization](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/), [official boards API](https://github.com/pinterest/pinterest-python-generated-api-client/blob/main/docs/BoardsApi.md)
