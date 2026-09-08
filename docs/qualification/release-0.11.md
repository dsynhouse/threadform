# Release 0.11 verification

8 September 2026. This release addresses conversion scrolling, manual digitizing and original-artwork layers. It does not certify Wilcom parity or physical sewing quality.

## Implemented behavior

- Convert owns its scroll area at desktop, tablet and short-window breakpoints; its controls stay mounted when changing workspace. The studio's desktop minimum height is overridden for Convert.
- Reference artwork is an independent layer behind the editable objects and stitches. Show/hide, dim/undim, opacity, locked placement and mm/in dimensions are saved with the project. Rotation and nonuniform design resizing retain an affine transform. Reattaching a missing reference retains its placement.
- Originals are cached in IndexedDB under an account/local namespace. Successful uploads use private Supabase Storage. Failed uploads keep the local image and offer retry; the UI does not label those images cloud-saved. Moving an unclaimed offline session into its first account retains the original image cache. Account-to-account transfer is not implicit.
- Bitmap conversion attaches its original image automatically. SVG conversion retains its editable vector geometry and source file; SVG reference insertion is available separately.
- Column A shows paired-edge input and rungs, B supports independently curved edges and an elastic next-edge guide, and C previews its baseline width/offset. The preview evaluates the same source geometry used when committing a column.
- Backspace unwinds B's second-edge phase and C's width phase. Escape clears C's captured baseline. Point refs update synchronously, so rapid click/Enter sequences use the latest point. Alt bypasses snap temporarily.
- Freehand accepts coalesced pointer events, uses screen-distance sampling, exposes smoothing and retains the exact released endpoint. The former 12,000-sample capture cutoff is removed; the overall geometry budget still applies. Manual needle mode does not turn points into curves. Finished drawings leave their tool ready for the next object.

## Software verification

The prior 159 regression checks are retained. Ten new checks cover stage undo, Alt snapping, coalesced sample/endpoints, jitter simplification with corner retention, preview-to-column geometry equality, artwork JSON round trips, affine resizing, machine-output invariance and corrupt transforms. The full suite totals **169** checks including built-server and shared-UI checks. TypeScript, ESLint, Next.js and Sites builds are required for this release.

Independent machine decoding uses pyembroidery 1.5.1. Database isolation tests execute actual migrations in local PGlite. These checks do not exercise the supplied live Supabase project. Reference transforms and opacity are verified not to change any of the four machine exports or the production fingerprint.

## Remaining acceptance checks

- [ ] In Chrome, Safari and Firefox, reach the last Convert control at a short desktop height, ordinary laptop size and mobile width, with scrolling by wheel, trackpad and keyboard.
- [ ] On a Mac, pinch zoom affects only the canvas; pan and pointer capture recover after leaving the canvas or cancelling a gesture.
- [ ] Insert, dim, hide, rotate, lock, save, reload and reattach a reference; download the original successfully. Repeat across two devices after Supabase activation.
- [ ] Rapidly enter A pairs, unequal curved B edges and centered/offset C baselines with mouse, trackpad and pen. Exercise Backspace, Enter, Space and Escape at each stage.
- [ ] Apply the existing Supabase migrations to `wnjsliqsktxyfmuzcqxx`, set the actual publishable key and qualify signup, email confirmation, guest linking, password recovery, account isolation and private Storage.
- [ ] Import `dsynhouse/threadform` into Vercel, set its production branch to `main`, qualify the live build and verify a later push updates the same production URL.
- [ ] Confirm machine-file reconstruction in the target Wilcom version and perform physical sew-outs. A native EMB adapter still requires a documented licensed interface.

Browser interactions, live provider activation and physical machine tests are explicitly separate from the passing local software checks. Supabase and Vercel connections are present, but their authenticated actions were not exposed in the working session; the project URL alone cannot complete activation. See [deployment setup](../DEPLOYMENT.md) and [the broader roadmap](../INTEROPERABILITY.md).

## Public workflow references

- [Wilcom Column A input](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-20.htm)
- [Wilcom Column B input](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-22.htm)
- [Wilcom Column C input](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-15.htm)
- [Wilcom artwork visibility and dimming](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Setup/settings/Image_viewing_options.htm)

These references describe public workflows. Threadform's implementation is original code; no access to Wilcom's proprietary algorithms is claimed.
