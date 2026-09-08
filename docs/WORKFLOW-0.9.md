# Threadform 0.9 — implementation checklist and improvement plan

8 September 2026. This release implements the actionable first phase of the Wilcom workflow review. It is a software release candidate, not a claim of full Wilcom parity or physical machine qualification. Live Supabase activation, a user-owned GitHub repository and Vercel deployment remain pending access and activation checks. See [deployment instructions](DEPLOYMENT.md).

## Implemented in this change

- [x] Give Convert a constrained, independently scrolling page inside the fixed-height studio. Keep the converter mounted across workspace changes so temporary settings and corrections survive navigation.
- [x] Separate **Visible** from **Include in sewing**. View hiding no longer changes stitch bytes, sewing order or the production fingerprint. Legacy hidden objects retain their previous exclusion until the user changes it explicitly.
- [x] Add local project and conversion recovery, including original bitmap files, trace settings and corrected vectors. Checkpoints run after 450 ms of inactivity and on page lifecycle events; a successful checkpoint is acknowledged only after the IndexedDB transaction completes.
- [x] Add online autosave, immutable revision checks and retry identifiers. A retry acknowledges the exact prior snapshot; it cannot mark later edits saved. Conflicts preserve the local draft and offer Retry, Save a copy and project download.
- [x] Restore the saved workspace, view, selection, zoom, units and playback position. Keep recovery separated by verified account or browser studio. Account changes invalidate in-flight saves and clear the active workspace before recovery. Work begun without a server identity is retained when that session reconnects.
- [x] Avoid stitch jobs for renaming, thread metadata, visibility, unit or view changes. Debounce geometric changes and cancel obsolete workers. Show the previous valid preview while updating and disable export until the current plan succeeds.
- [x] Preserve enclosed white artwork when removing the exterior white background. Keep an advanced option to remove all whites deliberately.
- [x] Support region colour corrections, explicit merges, colour locks and embroidery/print/fabric/reference roles without starting the trace again. Retrying a trace warns before replacing corrections.
- [x] Retain an original-artwork reference and exact trace options in saved projects. Supabase uses private, owner-scoped assets; local conversion drafts also preserve files when offline.
- [x] Correct Column A/B/C input stages, compact control geometry, Enter/Space completion and width/offset editing. Add Bézier handles, node traversal and continuation from either endpoint while retaining object identity and stitch settings.
- [x] Remove the remaining general numeric-field maximum and the imported-DST hoop-reference clamp. Preserve the existing unrestricted finite artwork dimensions, mm/inches and removal of arbitrary region/object quotas.
- [x] Remove old online project-count and revision-count quotas. Retain bounded request sizes, finite geometry, save-rate controls and processing budgets.
- [x] Prepare separate Next.js/Vercel and Sites runtime adapters. Existing guest saves use their original bindings; standalone projects, revisions, originals and inspiration boards use Supabase.
- [x] Add SQL migrations, private artwork storage, email account linking, direct signed transfers for larger snapshots, deployment instructions and a GitHub verification workflow.

“Implemented” describes code and available controls. Browser interactions, live provider configuration and actual machines require the separate acceptance gates below.

## Column behavior and remaining differences

| Tool | Input now supported                                                                                                                                                                                  | Retained editable structure                                                                        | Remaining qualification or capability                                                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | Alternate points on opposite edges; left click for corners, right click for curves; Enter keeps the final cross-stitch, Space omits it.                                                              | Corresponding edge pairs, with independent curve flags and handles.                                | Test difficult turns, tapered tips and keyboard/mouse behavior in supported browsers.                                                                                                    |
| B    | Draw the first edge and press Enter, then independently draw the second edge; unequal node counts are accepted. Enter/Space complete the second edge.                                                | Both original compact edges; direction follows the last entered edge.                              | This implementation pairs edge distances geometrically. It does not reproduce Wilcom's proprietary internal turning algorithm. Test extreme concavity and unequal-edge parameterization. |
| C    | Draw a baseline, press Enter, then mark two width references; Enter again uses the default/existing width. Right-click width references establish an offset. Space switches between Run and C input. | Baseline curve plus numeric width and signed offset; close the baseline by returning to its start. | Relative stitch-angle and orientation controls documented by Wilcom remain planned. Sharp-turn behavior needs a dedicated comparison corpus.                                             |

Node editing now exposes editable Bézier tangents; dragging is one Undo operation. Tab/Shift-Tab traverse nodes when the canvas has focus. Backtick continues a selected open run or column; Shift-backtick continues from the other endpoint. Continue retains thread, density, underlay and compensation settings. Multi-angle guides for complex turning fills and graph-based branching remain separate engine work.

The references are Wilcom's public [Column A](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-20.htm), [Column B](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-22.htm), [Column C input](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-15.htm), [width/offset](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-16.htm), [relative angles](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-18.htm) and [Continue Digitizing](https://wilcom.com/resources/blog/continue-digitizing-existing-objects) documentation. They establish workflow expectations; they do not establish identical generated stitches.

## Review coverage

| Review item                  | Delivered now                                                                             | Next acceptance condition                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 — View versus sewing    | Independent view/output controls and native-byte regression checks.                       | Browser toggling must leave all four downloaded formats unchanged.                                                                       |
| P0-2 — Draft recovery        | Local checkpoints, autosave, stable retries, account isolation and conflict preservation. | Exercise reload, offline restart, response loss, account switching and two-tab edits on real browsers and live Supabase.                 |
| P0-3 — Recalculation         | Metadata changes skip generation; obsolete workers stop; previous preview is labelled.    | Add per-object dependency caching, with byte-equivalence checks against uncached full generation and measured response times.            |
| P0-4 — Source retention      | Local source/settings/corrections and a private cloud source link.                        | Reopen source on another device and correct a region without losing unrelated edits.                                                     |
| P1-1 — Reshape precision     | Bézier tangents, column-aware nodes, C width/offset and endpoint continuation.            | Add editable turning-angle guides and C relative angle/orientation; validate geometry, Undo and serialization.                           |
| P1-2 — Object navigation     | Cache sewing indices and skip offscreen row painting.                                     | Virtualize grouped colour/sequence sections; drag blocks; preserve focus, selection and keyboard reordering across thousands of objects. |
| P1-3 — Fabric-aware fields   | Existing fabric presets remain available.                                                 | Store per-field From fabric/Custom inheritance, preview bulk updates and preserve overrides unless explicitly reset.                     |
| P1-4 — Continuous linework   | Extend an existing open path without creating another object.                             | Reviewable compound graph joins, branching, intentional gaps, colour boundaries and manual endpoints.                                    |
| P1-5 — Colourways            | Existing recolouring and exact-colour locks.                                              | Named non-destructive fabric/thread variants sharing unchanged geometry and original source colours.                                     |
| P1-6 — Large-design planning | Freeform finite geometry, mm/inches and separate machine checks.                          | Ordered multi-field sections, registration marks, explicit origins, coverage audit and physical alignment trials.                        |
| P1-7 — Export profiles       | Existing native packages, cutting SVGs and approval PDFs.                                 | A saved profile builds all selected outputs from one immutable revision, with checksums, progress and resumable retry.                   |
| P2-1 — Compound layers       | Existing editable grouped shading objects.                                                | Shared master geometry with independently editable stitch layers, layer sequencing and deterministic regeneration.                       |

## Verification record

The release checks completed with **146 automated checks passing**, clean TypeScript and ESLint, and successful Next.js/Vercel and Sites builds. The Sites build retains a large-client-chunk advisory; splitting the editor bundle is part of the performance work below. Run `npm run check:all` for the algorithm, independent decoder, SQL and transfer suites, then the built-server tests after a successful Sites build. CI reproduces these commands after GitHub import; a GitHub-hosted run has not yet occurred.

| Suite                               | Passing checks |
| ----------------------------------- | -------------: |
| Embroidery                          |             23 |
| Shape workshop and optimization     |             14 |
| Digitizing and PDF structure        |             12 |
| Refinement                          |             15 |
| Native production formats           |             13 |
| Tatami routing                      |              8 |
| Stitch coherence                    |             12 |
| Dimensions and units                |              7 |
| New workflow and columns            |             12 |
| PostgreSQL isolation and migrations |             11 |
| Large project transfers             |              3 |
| Built server and shared UI          |             16 |
| **Total**                           |        **146** |

The tests exercise real stitch generators and serializers; production-format checks use the independent pyembroidery reader. SQL tests execute the migrations in PGlite with separate authenticated identities. Built-server tests use a SQLite/blob adapter. Signed-transfer tests use a simulated private-storage service and verify complete byte counts and SHA-256 integrity. These do not replace live provider tests or user interaction tests.

Specific regression coverage includes unchanged native outputs when hiding objects, altered output when excluding them from sewing, metadata invalidation, source-setting round trips, compact unequal B rails, A/B final-side behavior, C offsets, Bézier preservation, continued-object settings, interior-white retention, more than 400 saved objects, revisions after 500, cross-owner denial, account-namespace mismatch, historical idempotent retries and large-project read/write transport.

No browser interaction qualification was performed for 0.9. Previous Chrome checks in `RELEASE-QUALIFICATION.md` concern an older release. The Convert overflow fix has code-level verification; scrolling at actual viewport sizes remains a required browser check.

## Ordered improvement program

### Gate 1 — Prove everyday work survives

Complete live Supabase setup and the acceptance checklist in [DEPLOYMENT.md](DEPLOYMENT.md). Test saved state in Chrome, Firefox and Safari at desktop and tablet sizes. Include Convert scrolling with both a tall original and thousands of regions, pointer cancellation, keyboard focus, export delivery, interrupted uploads, browser restart, denied IndexedDB storage, account changes in two tabs and conflicts while offline.

Add an accessible recovery picker for older local drafts, retention controls and storage-usage feedback. Current recovery opens the latest valid draft per identity; older checkpoints are retained but have no picker. Undo history and canvas pan are not currently persisted. A sudden process failure before the debounce completes can lose the newest uncheckpointed action; private browsing or cleared site data can remove local recovery. Online revisions and downloaded editable projects remain independent copies.

Acceptance: a recorded test matrix with zero unexplained lost edits or cross-account reads, actual download files inspected, successful backup restoration, and visible actions for every recoverable save error.

### Gate 2 — Reduce correction time

Implement grouped/virtualized object navigation, per-object generation caching and a fabric inheritance model before expanding toolbar count. Give grouped sequence drag operations a preview and one Undo. Keep simple conversion focused on artwork size, colours, background and detail; advanced thresholds stay behind disclosure. Add targeted region retracing against the retained original, with a comparison that preserves unrelated edits.

Benchmark a fixed corpus: an 18 × 27 inch design (457.2 × 685.8 mm), an enclosed white flower, a ring with a thin bridge, a tiny isolated accent, fine lettering, touching similar colours, open linework and a dense multi-colour image. Record source-mask agreement, retained holes/details, vector-work count, time to first preview and expert correction time. Compare corrected designs at the same physical size and fabric settings; bitmap upscaling cannot recover missing source detail.

Acceptance: agreed reference outputs and repeatable measurements; no silent dropped regions, stale Apply action, overwritten region correction or colour-lock violation. Per-object caching must produce the same final command stream as full regeneration.

### Gate 3 — Extend precise digitizing

Add turning-angle guides, C relative angle/orientation, graph branching, corner controls and endpoint travel review. Follow with named colourways and shared master geometry for compound stitch layers. Preserve editability rather than flattening these features into generated stitch lines.

Use comparison fixtures for mixed curved/corner A pairs, unequal B edges entered in both directions, offset C baselines, concave fills, islands, holes, acute turns and tapered satin tips. Keep travel stitches inside intended regions and show unavoidable jumps explicitly. Require serialized round trips, Undo, containment and independent format decoding before interactive qualification.

Acceptance: expert-reviewed results for the fixture corpus and a documented explanation of intentional differences from Wilcom. Do not infer native EMB object equivalence from a stitch-file import.

### Gate 4 — Qualify production output

Add immutable export profiles and multi-field registration planning, then qualify the chosen machine models. A physically unlimited drawing surface does not imply unlimited machine travel. Native DST/PES/JEF/EXP are needle-command formats; they do not transfer Threadform's object model as editable Wilcom EMB objects. The current tatami routing is continuous and is checked after independent decoding; Wilcom's recognition of imported stitch blocks is a separate external test.

For each supported machine/profile, record machine model, controller/firmware, needle, hoop/field, material, stabilizer, thread brand/range/shade, tension, file checksum and design fingerprint. Sew the same reference corpus and record dimensions before/after, registration, edge coverage, thread breaks, trims, stops and operator observations. Attach photographs and approve only the exact file/settings tested. Repeat after material, firmware, machine-command or engine changes.

Specialty commands need documented controller encodings and the appropriate hardware. The existing DST sequin controls do not establish chenille, chain, boring, Schiffli, multi-sequin or cording support. Implement a capability matrix and refuse unsupported requested commands rather than silently substituting a decorative lockstitch path.

Complete thread catalogues need manufacturer-authorized data, range/shade identity, provenance and a revision date. Screen hex approximations are not calibrated physical colour values. Record measurement instrument, illuminant/observer, substrate and lot when importing measured values; validate against physical swatches and licensed reference data. Never label a guessed palette calibrated.

Acceptance: independently decoded files plus signed, version-linked machine reports; no machine-readiness claim based only on unit tests or previews.

### Gate 5 — Operate an independent service

Create the user-owned GitHub repository when repository actions are available, activate the prepared CI, protect the release branch and pin reviewed action revisions. Deploy the Next.js build on Vercel with the selected Supabase project. Configure real email delivery, monitor save/auth/storage failures, rehearse backup restores and implement bounded orphan/anonymous-user retention and abuse controls. Port Pinterest's remaining Sites-specific OAuth persistence before enabling that optional integration on Vercel.

Acceptance: passing hosted CI, staging-to-production promotion, successful account/recovery checks on the final domain, documented rollback, and measured operating limits. Only then invite production users beyond the qualification group.

## Limits kept deliberately

There is no fixed maximum physical artwork width or height and no arbitrary region/object count gate. The app still requires finite geometry and enforces resource budgets: 32 MB imports, 8 MiB online snapshots, 150,000 aggregate vector-work units, bounded bitmap resolution and worker duration, and 350,000 generated commands. Machine format fields, sewing areas and printable-page counts have their own real limits. Large exports must be planned in sections rather than truncated.

References for the conversion workflow: Wilcom [Smart Design](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Automatic/automatic/automatic-10.htm), [individual shape conversion](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Automatic/automatic/automatic-11.htm) and [bitmap preparation](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Automatic/automatic/automatic-4.htm).
