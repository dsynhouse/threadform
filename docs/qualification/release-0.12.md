# Release 0.12 audit

Audited 8 September 2026. This is a software reliability release. It does not certify every possible design, Wilcom object recognition, or a physical embroidery machine.

## Repository reconciliation

[PR #6](https://github.com/dsynhouse/threadform/pull/6) was reviewed and merged into `main` at `39a62f2335d440e038b21738bd6864677a9a2343`. Its source tree exactly matched the reconciled local checkout before these additional fixes. GitHub Actions passed on that merge and the Vercel Git integration reported a successful deployment. Further release changes must pass their own CI run.

## Defects corrected

| Area | Failure | Correction and evidence |
| --- | --- | --- |
| Concurrent guest saves | Identical retries shared an R2 key; the losing request could delete the committed snapshot. Different payloads could overwrite that key. | Content-addressed immutable blobs, an atomic unique save ID, and verified retry acknowledgements. Forced concurrent-request tests retain the winner's bytes and exactly one revision. |
| Ownership during a save race | A retry acknowledgement could resolve an identifier claimed by a different owner after the initial ownership read. | The acknowledgement lookup also checks current ownership. A simultaneous cross-account collision is rejected and the losing account cannot reopen the winner's project. |
| Supabase payload validation | SQL NULL comparisons allowed an absent project version through the save RPC. Non-text names were not explicitly rejected. | Exact JSON type/value guards and explicit SQLSTATEs. Local PostgreSQL tests and rollback-only live SQL negative cases reject both. |
| Account outages | A failed identity lookup could be interpreted as a signed-out user, including during guest-to-email signup. | One verified-user helper distinguishes missing sessions from invalid sessions and provider outages. Account API tests prove no signup or link mutation starts on an identity-provider failure. |
| Save recovery | Rejected oversized/invalid snapshots could keep their old pending save identity after the design was corrected. | Client request errors clear the invalid pending snapshot; a subsequent design edit permits a new save. Conflicts and transient retries preserve their pending identity. |
| Local storage recovery | A synchronous IndexedDB denial could remain cached forever; an abandoned blocked upgrade could later leak an open connection. | Failed opens can retry and late successful abandoned opens close. Regression tests exercise both event sequences. |
| Pagination | Offsets above 10,000 were clamped, repeating the same page; fractional/invalid offsets could become server errors. | Shared nonnegative safe-integer parsing and uncapped valid offsets for projects and reference boards. API tests cover invalid values and pages beyond 10,000. |
| Large fill generation | Huge tatami/program-split allocation could exhaust memory before a useful error. Contour and Island Coil could stop with an unfinished interior. | Allocation/precision checks precede construction. Exhausted contour passes fail explicitly; incomplete objects cannot be silently exported. |
| Downloads | An automatic click offered no persistent retry after the browser failed to report delivery. | A single retained File ready link provides a manual retry; account changes, replacement and dismissal release its blob. The UI says prepared, not delivered. Completion remains a browser qualification gate. |
| Editing and accessibility | A removed object could remain counted as selected after Undo. Slider thumb labels did not reach the interactive element. Column help omitted input stages. | Selection is derived from existing objects, slider labels reach their thumbs, and A/B/C prompts explain their distinct stages. Browser and component checks cover the corrections. |
| Independent startup | Standalone startup did not reliably load Next.js production environment files or forward termination signals. | Use Next's environment loader, preserve runtime precedence, copy static assets and forward signals. A subprocess test runs the actual launcher. |

## Dependency and CI security

The initial npm audit reported 22 affected packages (16 high, five moderate and one low). After compatible transitive updates and explicit framework updates, the full dependency audit reports **zero known vulnerabilities**. This is a dated advisory check, not proof that dependencies cannot contain unknown defects.

- Next.js 16.3.4; React, React DOM and the RSC runtime 19.2.8.
- Vite 8.0.16, Vinext 1.0.0-beta.9, Cloudflare Vite plugin 1.54.5 and Wrangler 4.129.1. Vinext is prerelease software and the Sites adapter remains a separately tested compatibility target.
- A scoped override moves the legacy `@esbuild-kit/core-utils` transformer to esbuild 0.28.2. Its used transform API remains available; dependency-tree validation and the actual Drizzle generation command pass with no unintended schema changes. Keep this override until the legacy loader is removed upstream.
- GitHub Actions are pinned to their verified v7 commit SHAs. CI now rejects high/critical npm advisories in addition to running both builds and all regression checks. The lockfile is committed; installation does not use an audit force-upgrade or downgrade Drizzle.

Relevant advisories include [Next.js](https://github.com/advisories/GHSA-6gpp-xcg3-4w24), [React Server Components](https://github.com/advisories/GHSA-wx67-qw84-cm4g), [Vite](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) and the [legacy esbuild server](https://github.com/advisories/GHSA-67mh-4wv8-2f99). Both builds and the 188-check suite were rerun after the framework changes.

## Verification scope

The release suite covers 159 distinct embroidery/workflow/SQL/transfer checks and 29 API, recovery, component and launcher checks. TypeScript, ESLint, formatting, the Next.js build and the Sites build are separate gates. Machine-format tests independently decode output using pyembroidery 1.5.1; Python is not an application runtime requirement.

| Feature family | Software coverage | Interactive qualification in this audit |
| --- | --- | --- |
| Stitch generation | All 32 methods, holes, disconnected regions, row continuity, underlay, compensated geometry, length limits, trims, colour stops and per-object rollback | Generated stitch previews and object totals inspected for the synthetic design; A/B/C and underlay controls exercised |
| Artwork and conversion | SVG paths/transforms, bitmap colour reduction, hole/detail preservation, units, size validation and project round trips | Intricate bitmap traced at 2,500 × 2,500 mm; four elements and 896 points retained; resized to 60 mm without retracing and used in Studio |
| Convert scrolling | Scroll layout and conversion-state implementation reviewed | Scroll container reached its actual bottom: 714 px viewport, 1,355 px content, 641 px scroll offset |
| Drawing and reshape | Corner/curve flags, source nodes, independent column edges, width/offset capture, geometry transforms, cutting, underlay and navigation event tests | Column A paired points/right-click curve; Column B unequal edges, Enter and Backspace stages, Space finishing; Column C curved baseline and two width points |
| Reference artwork | Layer persistence, transform isolation, local/cloud references and transfer checks | Dim/undim, hide, unlock, rotation and original bitmap retained after reload |
| Auto-digitizing and optimization | Method selection, colour protection, overlap order, routing, immutable application and stale-preview handling | Both previews generated, applied and undone; detailed per-object reasons visible |
| Cross-stitch chart | Full/partial crosses and chart geometry | Keyboard painting, move to another cell, chart Undo, add to Studio and Studio Undo |
| Analysis and colour | Perceptual matching, exact colour locks, physical thread-code changes and colour/object totals | Colour selection activated Edit selection; object and colour breakdowns rendered |
| Saving and revisions | Guest isolation, concurrent writes, stable retries, stale revisions, malformed payloads, rate-limit mapping and signed transfers | Guest save/reload, revision list, earlier-revision restore followed by a new revision; later revisions retained |
| Inspiration | Owner checks, safe URLs, reference CRUD and pagination | Synthetic reference saved, survived reload and was removed; workspace resumed after reload |
| Print and export | PDF/project generation, SVG/handoff data, DST/PES/JEF/EXP independent decoding and command constraints | Four-page approval PDF rendered in Chrome; prepared machine-package retry link visible. Completed file delivery was not confirmed by this browser |
| Help and production review | Shortcut mappings, guides, machine capabilities and sew-out fingerprint logic | All nine guide steps navigated; stitch inspector and command coordinates rendered; production checks and explicit pending qualification states rendered |

The browser audit used the supervised Chrome preview with synthetic artwork and test data. After the framework updates, the preview was restarted; the saved project resumed, edits regenerated, and duplicate/Undo/Redo correctly changed selection from one to zero and back. It is not a Safari/Firefox/mobile/pen/Mac-trackpad test. An application error was not observed in the inspected browser logs; browser-extension metadata errors were external to the app. The review does not establish absence of every runtime error.

One optimizer preview increased jump travel from 223.26 mm to 235.17 mm while preserving the other displayed totals. Its heuristic may trade metrics or make a worse proposal; compare before applying. A future optimization acceptance rule should retain the original sequence whenever the chosen objective does not improve.

## Live backend evidence

The selected Supabase project has six applied migrations and schema version 4. The release migration rejects missing/invalid versions and non-text project names. Transactional live checks under an unrelated authenticated identity confirmed no project visibility, denied direct revision updates, and denied anonymous execution of the save RPC. Those checks rolled back and did not add customer data.

The advisor reports the authenticated `SECURITY DEFINER` save RPC. This is an intentional restricted-write architecture: direct table writes are denied and the RPC verifies identity, ownership, expected revision and save ID. Its security contract remains reviewable; the advisory is not silently suppressed. Unused-index notices on the new database are informational. See [deployment and activation](../DEPLOYMENT.md).

The Sites guest database uses its own D1/R2 adapter and new `0002_atomic_guest_retries.sql` migration. It does not silently transfer existing guest work to a different domain or Supabase identity.

## Wilcom comparison

The public manuals describe Column A as alternating paired edges, Column B as independently entered sides, and Column C as a baseline followed by width/offset references. Those input stages are implemented and were exercised here. Extreme turns, smoothing and vendor-specific corner processing still require a representative comparison set. [Column A](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-20.htm), [Column B](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-22.htm), [Column C](https://docs.wilcom.com/embroiderystudio/28/en/OnlineHelp/Digitizing/input/input-15.htm)

Coherent needle routing preserves a fill's sewing structure. A machine format still does not carry the original typed Wilcom objects. Native EMB creation requires an authorized object-level integration and target-version round trips. No proprietary Wilcom algorithm or trained model was accessed. See [interoperability and the roadmap](../INTEROPERABILITY.md).

## Remaining release gates

- Verify final-domain Supabase signup, email confirmation, password reset, anonymous-user linking, two real accounts, private Storage and cross-device resume. SQL isolation tests do not replace these flows.
- Restore Vercel connector access to the `dsyn-houses-projects` team. The current token returns 403 for that scope. Deployment statuses are visible through GitHub; production environment values, aliases and Auth callback settings remain unverified.
- Confirm completed PDF/SVG/project/machine downloads in every supported browser and test physical Mac trackpad, Windows mouse/pen and mobile navigation.
- Rehearse backups and restore, snapshot/orphan retention, anonymous-account cleanup, monitoring, abuse prevention and capacity/cost limits. Branch protection needs repository administration access.
- Qualify each intended machine/controller, fabric, stabilizer, needle and thread combination through recorded sew-outs. Verify Wilcom machine-file recognition separately.
- Obtain the authorized native EMB interface and licensed, measured manufacturer thread catalogues. Screen RGB matching is not physical calibration. Unsupported chenille/cording/multi-sequin commands remain unsupported.

Physical artwork dimensions have no fixed maximum. Finite numerical geometry, upload budgets, browser memory and controller format limits remain explicit. Removing those guards without a streaming representation would exchange a clear error for a crash. The next architecture work is progressive generation, compact buffers, spatial indexing, cancellation and registered multi-field output.
