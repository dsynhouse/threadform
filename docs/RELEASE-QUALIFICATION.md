# Release qualification

This file records historical releases through 0.5. Current implementation, test evidence and outstanding gates are in [WORKFLOW-0.9.md](WORKFLOW-0.9.md); older browser results do not qualify the new release.

Threadform 0.5 is a substantial studio preview with functional drawing, Boolean cutting, stitch optimization, tracing, saved projects and export. It is not yet a qualified substitute for a professional embroidery system.

## Implemented software controls

- Private browser studios without a login. A cryptographically random 256-bit HttpOnly, Secure, SameSite=Lax cookie establishes ownership; only its SHA-256 hash is used as the storage owner key.
- Owner checks on every saved project, historical revision, reference and uploaded preview. Project content is never included in a public listing.
- Same-origin checks on mutation endpoints. Bounded request readers, project validation, prepared SQL, schema migrations, save rate limits and per-studio record limits.
- Project snapshots in R2 and revision metadata in D1. A compare-and-swap update prevents stale saves from replacing later edits. Cross-service failures can leave an unreferenced blob; they do not authorize another visitor to read it.
- D1-backed reference metadata, authenticated image routes and raster-only upload signatures. Arbitrary reference URLs are stored as links and are never fetched by the server.
- Pinterest uses state values tied to the owning studio, expiring single-use authorization, server-only client secrets and AES-GCM encrypted tokens with owner-associated data. Redirects and API calls use official Pinterest endpoints.
- Worker isolation, debounce, termination of obsolete stitch jobs and timeouts; bounded geometric and stitch sizes. No paid AI API is required for the implemented rule-based digitizer.

## Automated verification

Run `npm run check:embroidery` for format and geometry checks. These cover exhaustive DST displacement encoding, holes/winding, stitch limits, curved satin rails, outline methods, clipped decorative fills, element splitting, SVG export and version-linked sew-out records.

Run `npm run check:workshop` for the editing and optimization invariants: Boolean analytic areas; knife area conservation; open-path splitting; eraser footprint; inset shell/hole behavior; overlap allowance and sparse-fill exclusions; tiny-hole travel containment; contour and underlay containment; complementary shading density; appliqué pass order and cutting scale; overlap/lock-preserving sequencing; run direction locks; direct bounded colour merging; trim command changes; and new project settings/fingerprints.

All geometric tests run the actual generators and serializers. They do not establish physical material quality. The v0.3 suite caught an inset edge-walk resampling shortcut and now checks containment of the corrected contour walk.

After a successful build, run `node --test tests/rendered-html.test.mjs tests/storage-api.test.mjs`. Storage API checks execute the built worker against an in-memory SQLite database and a blob-store test adapter; they are not live browser or production-storage tests. They cover public session initialization, private project access, blocked cross-origin writes, immutable revisions, stale-save rejection, reference ownership and unconfigured Pinterest status.

Type checking: `npx tsc --noEmit` using the installed toolchain. Cloudflare declarations describe only the runtime binding methods used by this app. The test runtime uses Node 24's synchronous module hooks to supply those bindings.

## v0.4 validation additions

The 12 digitizing checks cover 25 actual generators, pattern splits, mixed curve columns, freeform origin-aware DST, field/count gating, DST import rejection, exact palette/tiny-hole tracing, centreline extraction, thread charts and PDF pagination. Approval sheets use bundled, licensed DejaVu fonts embedded in each PDF; layouts are rendered and inspected with Poppler. See `DIGITIZING-0.4.md`.

## v0.5 verification, 7 September 2026

The release passes 76 automated checks: 23 embroidery, 14 workshop, 12 digitizing, 15 refinement, and 12 built-worker / shared UI checks. TypeScript and ESLint complete with no errors or warnings. The production build succeeds; Vite reports a large-chunk advisory.

The refinement suite checks published CIEDE2000 numeric reference pairs, protected touching colour groups without transitive contrast loss, stale thread-assignment removal, actual paired satin inference, an area-bounded curved ribbon, locks and existing running outlines, bitmap pixel-mask roundtrips for holes/thin bridges/isolated detail, neighbour speck merging, clipped specialty paths, raised-satin layers, cross ordering, unambiguous shortcut chords, method conversion and the secure UUID fallback.

A production-worker test confirms that even an HTTP request with a local-looking hostname cannot receive the development cookie. The other API tests retain independent owner sessions, immutable revisions, idempotent retries, cross-origin rejection and reference boundaries.

### Browser interaction checks

Chrome QA used the internal development preview with nonsensitive generated artwork. Completed checks include:

- All nine quick-start steps, closing the guide and changing workspaces; searchable shortcut references and visible hover/focus explanations.
- O/H/P/A/F5/F9 and Shift-I tool/method actions, Home/End command travel, colour filters and the Shift-J progression inspector; Ctrl-D duplicate, undo and typing isolation. Right-click curves on both edges of a Column B create a real 260-stitch column. Triple-run input creates the correct method.
- Auto-digitizing decisions, applying/undoing the reviewed project and disabling Apply after settings change.
- Cross-chart pointer painting, exact displayed cell alignment, keyboard move/paint/erase, stroke undo, artwork sampling and adding editable chart objects.
- Raised-satin sample generation and application; optimization preview/application; explicit colour merge and undo.
- Bitmap chooser, tracing a ring/bridge/small accent, retained physical width, element breakdown, vector-only comparison and transfer to Studio. SVG import preserves an 80 × 60 mm document, its hole and curved ribbon.
- Project save and reopening the saved revision after a page reload, using a local-only development session and the existing migrations in the preview database.
- Approval PDF generation and visual inspection of the embedded two-page stitch proof and sequence. The cold development PDF dependency load caused a development reload; the warmed preview rendered normally.

QA fixed UUID creation on HTTP, cross-chart coordinate mapping under aspect-ratio constraints, stale form state, low-contrast and unstyled editable fields, and colour-isolated density rendering. Persistent production data was not used for these checks.

### Remaining browser verification limits

Browser download-event waits for SVG and PDF did not return a completed file, and the supported file-link fallback did not yield a synchronized artifact. The PDF itself rendered in the browser. Serializer and PDF pagination checks pass, but browser download delivery remains **unverified**, and the browser cannot establish machine acceptance. Repeat downloads in supported release browsers before calling the product production-ready.

The QA browser was one desktop Chrome viewport. Responsive styles are present; Safari, Firefox, mobile/touch, screen-reader flows and a complete physical-device keyboard matrix were not exercised. Pinterest live OAuth was not configured.

## Required before a production-quality claim

1. Browser interaction and accessibility checks on supported desktop browsers, plus touch and tablet behavior. Test drawing, pointer cancellation, undo history, file input, downloads, workers, keyboard focus and dialogs at real viewport sizes.
2. Actual-machine decoding and sew-out tests across selected machine formats/models, fabric, stabilizer, needle, thread and tension. Verify trim behavior, registration, underlay, push/pull, tiny details, overlapping objects and thread-break rates.
3. Reference image/vector corpus scored against expert manual digitizing, including lettering, holes, narrow curved columns, sparse details, photographs and dense multicolour designs. Include both objective geometric metrics and expert sew-out ratings.
4. Independent security review, hosted storage failure testing, load/cost limits, backup/restore policy and recovery flows for cleared browser cookies. Anonymous studios do not currently provide account-based recovery or automatic cross-device access.
5. Pinterest developer application configuration and provider access validation; confirm live OAuth, expiry/refresh, permissions, pagination and disconnect behavior. The implementation has not been tested with live provider credentials.
6. Advanced stitch and format engineering listed in `WILCOM-BLUEPRINT.md`, with independent decoders and machine-specific profiles.
7. Adversarial geometry corpus for self-intersections, narrow slivers, heavily nested holes and degenerate SVGs. Validate zero-width and high-point-count knife/erase gestures, stale/cancelled worker results, nonlinear transform behavior and optimizer changes on real layered designs. Test actual laser/cutter scale and add explicit appliqué stop commands only with a supported machine profile.

The preview's "passed" label is a user-recorded sew-out result for the current design. It is deliberately separate from overall product release qualification.
