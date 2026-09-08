# Threadform 0.8 — freeform scale and simpler conversion

## Completed

- Removed the 1,200 mm artwork-width/height restrictions from bitmap tracing, SVG import, resizing and project validation. Removed the separate ±10,000 mm coordinate restriction from source objects, entry/exit, start/end and DST editing. Dimensions must remain finite and positive (artboard/trace inputs retain a 1 mm minimum).
- Removed the 1,200 mm upper bound on custom hoop/field references. The selected physical field still constrains machine export, and format-specific requirements still apply.
- Added a saved, per-project mm/inches preference shared by size/position fields, stitch settings, measuring, rulers, analysis, stitch inspection and approval-sheet dimensions. Canonical geometry remains in mm. Fields accept decimal values, `18in`, `1200mm`, `3/4in`, mixed fractions and common fraction glyphs. Unit changes do not rescale geometry or alter machine stitch bytes.
- Canvas fitting, grid and rulers follow the viewport at large dimensions, including positions beyond the earlier ruler range. Texture/grid work no longer iterates over the entire artboard when zoomed in. Zoom can reach useful detail on large designs.
- Conversion defaults to size, colour count, detail preset and background removal. Advanced tracing, exact palettes and thresholds remain available. Width changes resize existing vectors without retracing. SVG dimensions can also be changed in the converter.
- Removed the 1,800-region, 2,000-contour and 400-object cutoffs throughout tracing, splitting, saving, SVG import, auto-digitizing, shape edits, repeats and lettering. No regions are discarded merely to satisfy a region count. An aggregate vector-processing budget replaces those count gates.
- Removed size ceilings from object transforms, motif size/radius/gap, pattern repeat size, effect/Column C width, offsets, custom fields and lettering height. Physical stitch-length/density rules and bounded specialty-pattern generation are retained.

## Verification

All 124 automated checks passed across the embroidery, workshop, digitizing, refinement, production-format, tatami, stitch-coherence, workspace, local Supabase and built-server/storage/component suites. TypeScript, lint and the production build also passed.

The dedicated seven-check workspace suite covers 1,200 mm portrait artwork whose proportional height exceeds the former cap; widths through 100,000 mm; 3,000 retained bitmap islands through separation and reopening; large resize/entry points; 900-object repeats; lettering above 60 mm; far-away ruler intervals; fractional inches; rejection of non-finite values; identical four-format stitch bytes after unit changes; and continued machine-field enforcement. The built storage test now saves and reloads a 15,000 × 24,000 mm project with inches selected.

Regression coverage includes holes, nested islands, stitch generators, vector editing, auto-digitizing and machine encoding. No new browser interaction or physical sew-out is claimed; the browser service previously rejected preview access under its URL policy.

## Remaining practical limits

“No fixed artwork size maximum” does not mean infinite memory or unlimited machine movement. Geometry uses finite JavaScript numbers. Tracing retains its source-pixel, upload-size, processing-time and aggregate vector-work budgets; the stitch generator retains its command budget. These constraints report errors rather than silently losing regions. Very large production designs may need sections for processing and actual machine travel. Bitmap upscaling cannot recover absent source detail. PDF templates retain a page-count guard.

Blanket Wilcom parity, direct Wilcom object reconstruction, physical machine qualification, complete calibrated thread catalogues and live Supabase activation remain outside the completed claims of this release. See the production-readiness review for those gates.

## Wilcom references

- [Measurement units](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Basics/basics/Set_measurement_units.htm): switching units and entering explicit units/fractions. Threadform follows this interaction while storing physical geometry consistently.
- [Bitmap preparation](https://docs.wilcom.com/be-embroiderystudio/27/en/OnlineHelp2/Automatic/automatic/automatic-4.htm): review before/after colours, merge similar colours and control retained detail. Threadform uses a shorter default control set while keeping fine controls available.

Wilcom's documentation is a workflow reference; this review does not claim Wilcom itself has no limits or that Threadform uses its proprietary conversion engine.
