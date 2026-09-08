# Threadform 0.6 — production readiness review

Review date: 7 September 2026. **Release candidate; not physically qualified for production.**

Follow-up: [0.7 stitch coherence review](STITCH-COHERENCE-0.7.md) records the subsequent tatami, satin, fill and connector corrections. The historical counts below describe 0.6; the comparison packages now contain regenerated 0.7 needle paths.

## Implemented in this update

| Area                  | What works                                                                                                                                                                               | Limit of the claim                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Studio design         | Ink/porcelain theme, grouped Edit/Draw/Stitch tools, larger working area, consistent fields, panels and dialogs                                                                          | Desktop Chrome layout inspected; other browser/device combinations remain open                                                                                    |
| Reshape               | Source contour nodes, multiple selection, drag/nudge, corner/curve toggle, insertion/deletion, paired satin rails, angle control, entry/exit travel points, undo through project history | Uses editable Hermite corner/curve points, not Wilcom's proprietary object model; arbitrary Bézier handles and multiple local fill-angle lines remain future work |
| DST                   | Real Tajima displacement encoding, bounds, colour stops, three-jump trims, operator pauses, single-sequin mode/eject commands                                                            | Three-jump trimming and pause behaviour depend on the controller; single-sequin only                                                                              |
| PES                   | Native PES v1, CEmbOne/CSewSeg, embedded PEC stitches, format palette, overall and colour thumbnails                                                                                     | Palette approximation; no native EMB/PES editable-object reconstruction                                                                                           |
| JEF                   | Native JEF v1, supported hoop IDs, extents/margins, palette indices, trim sequences and stops                                                                                            | 50×50, 110×110, 126×110, 140×200, 200×200 mm around the configured origin; no JEF+                                                                                |
| EXP                   | Native movements, jumps, trims, colour/stop codes and EOF                                                                                                                                | RGB is carried in the separate thread-order file                                                                                                                  |
| Export packages       | Native file, editable project, SVG, thread order, manifest with SHA-256                                                                                                                  | A valid binary or checksum is not machine qualification                                                                                                           |
| Thread data           | Complete included PEC/JEF format palettes; CSV/GPL chart import; CIELAB measurements with source, date, instrument, observer, illuminant and lot                                         | These are **not** complete calibrated Madeira/Isacord/Gunold catalogues. Supplied measurements are user evidence, not independently certified                     |
| Machine qualification | Model/firmware, operator, material setup, file SHA-256, controller acceptance, dimensions, breaks and evidence reference; a pass requires the hash of the current design/format          | No sew-out or physical acceptance was performed by the software agent                                                                                             |
| Supabase              | Optional public account sign-in, sign-up, email confirmation, password reset/update and local sign-out; private account projects and immutable revisions                                 | Integration code and migration are prepared. No live Supabase project has been connected or migrated                                                              |

Guest designing remains public without a ChatGPT login. Existing guest project and reference data remain in their existing private D1/R2 studios. Signing in does not silently migrate or delete guest data; saving an open guest design after sign-in creates an account copy. Reference uploads and Pinterest retain the existing browser-studio backend.

## Tatami correction and Wilcom comparison

The earlier scanline traversal alternated between every span in a row. Holes and disconnected islands therefore created repeated jumps, trims and tie stitches. The new traversal groups one-to-one neighbouring spans into connected bands and stitches each band back and forth before changing regions. Boundary travel follows the contour when a direct connection would cut a concavity. Row penetrations share one coordinate lattice across both sewing directions, with a configurable interior minimum and bounded edge stitches. The engine retains tiny geometric corners; zero movement is removed only after rounding to machine coordinates.

| Controlled 30 mm test, 0.4 mm adjacent rows, no underlay/pull | Previous trims | Revised trims | Coverage |
|---|---:|---:|---|
| Solid square | 1 | 1 | Every row covered |
| Ring, 14 mm square hole | 36 | 2 | Both sides covered; hole retained |
| Two separate squares | 76 | 2 | Each island covered; no sewn bridge |

These results reproduce and correct fragmentation in our engine. They do **not** establish the cause of the user's particular Wilcom display without the affected file, Wilcom version, Open options and screenshot. No Wilcom installation was available for a direct import test.

The [comparison package](qualification/tatami-wilcom-comparison.zip) includes native DST/PES/JEF/EXP and the editable Threadform project. Its complete needle sequence and colour changes pass independent decoding. Underlay and pull are intentionally disabled in this evaluation coupon; physical qualification remains pending. Recreate it with `THREADFORM_FORMAT_REFERENCE=/path/to/pyembroidery node scripts/check-tatami.mjs --write-fixture` after installing `tests/requirements-formats.txt`.

Open the extracted machine file at its saved size. For an unchanged-stitch baseline in Wilcom, disable Objects/Outlines and Automatic Connectors; use three consecutive jumps for DST trim recognition. Then open a separate copy with recognition enabled if editable tatami objects are needed, and review the Tatami spacing/minimum-length ranges. Machine files contain needle paths; Wilcom reconstructs their objects. The SVG is artwork, and the Threadform JSON retains the original editable fill parameters. [Wilcom Open options](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Production/convert/Open_machine_files.htm), [advanced recognition](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Production/convert/convert-5.htm).

Threadform spacing measures adjacent rows. Wilcom's particular stitch/backstitch mode may define spacing differently; compare the actual needle paths before copying values. See [Tatami density](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Digitizing/stitches/Tatami_density.htm) and [program-split spacing](https://docs.wilcom.com/embroiderystudio/27/en/OnlineHelp/Decorative/patterns/patterns-9.htm).

## Release gates

- [x] Existing geometry, tracing, stitch, keyboard and PDF regression suites pass (64 checks).
- [x] Native-format and reshape checks pass, including independent pyembroidery decoding (13 checks).
- [x] Tatami row coverage, connected regions, stagger, angled holes, underlay, curve scaling and four-format decoding pass (8 checks).
- [x] Account migration executes on local PostgreSQL/WASM, with RLS, immutable history, retry/conflict and cross-account tests (7 checks).
- [x] Built-server HTML, public sessions, private project storage, account setup state and UI component regressions pass (13 checks).
- [x] TypeScript, lint and the production build pass. Total: **105 software checks** across the suites above. The build reports an application chunk above 500 kB; initial-load performance remains a release gate.
- [x] Desktop layout, reshape point selection/nudge/curve and entry/angle controls exercised in Chrome.
- [ ] Complete download delivery after the hash compatibility fix. The cloud browser blocked further preview access under its URL policy; no alternate browser path was used.
- [ ] Supported-browser matrix: Chrome, Firefox, Safari; Windows/macOS keyboard behavior; pen/touch; 200% text sizing and assistive technology.
- [ ] Connect an actual Supabase project; apply migration; validate signup/confirmation, login, expired sessions, recovery and two-account isolation against the hosted service.
- [ ] Configure production email delivery, auth rate limits, exact redirect allowlist and project availability plan.
- [ ] Obtain licensed/redistributable complete manufacturer thread data and measured colour references. Validate lot, illuminant/observer, calibration process and physical approval.
- [ ] Obtain exact machine/controller manuals and supported specialty encoding specifications.
- [ ] Qualify each exported format on each supported model/firmware. No blanket “all industry machines” claim.
- [ ] Run a representative expert-digitized corpus and independent sew-outs on the actual thread/fabric/stabilizer/needle/tension combinations.
- [ ] Establish load limits, telemetry without project contents, rollback ownership, backup retention and a tested restore procedure.
- [ ] Independent security review of the deployed auth, upload and persistence boundaries.

## Physical qualification protocol

Use at least one unit of each intended model and controller firmware. Record the exact machine model, firmware and installed specialty devices; a brand name or head count alone is insufficient.

| Test                | Required observation                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Controller import   | Recognized file, intended units/size/orientation/origin, expected thread-stop count, preview and stitch count          |
| Movement boundaries | All frame travel, jumps, start/end and trim sequences remain inside the actual field, including rounded edge cases     |
| Command coupon      | Colour changes, operator pauses, trims and supported sequin drops behave as encoded; unsupported features are rejected |
| Satin coupon        | Straight/turning/raised columns, short spans, split spans, underlay and pull compensation                              |
| Tatami coupon       | Density/direction changes, holes, islands, narrow slivers, gradients, patterned splits and overlapping objects         |
| Run coupon          | Run/double/triple/back, small curves, joins, entry/exit and tie stitches                                               |
| Appliqué coupon     | Placement, stop, tack-down, cover pass and cutting scale                                                               |
| Artwork corpus      | Fine lettering, botanical detail, large framed work, exact palette locks and combined printed/exposed fabric areas     |

Export a package, preserve its exact machine binary and SHA-256, load that file on the controller, sew, measure and photograph both sides. Record break rate, puckering, coverage, registration, distortion and operator corrections. Define acceptance thresholds with the production team before testing. A design change, machine/firmware change or material change requires a new review. Do not invent pass results.

## Supabase activation

1. Connect the Supabase integration and select the intended project. The app does not need a service-role key.
2. Apply `supabase/migrations/202609070001_threadform.sql` to a staging project first. Review the two RLS policies and the explicit grants on the atomic save function.
3. Configure server runtime `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` using secure environment settings. Local examples are in `.env.example`; never commit actual keys.
4. Set the site URL to the selected deployment origin and allow its exact `/auth/callback` URLs, including the recovery query. Keep production and staging allowlists separate.
5. Enable email/password auth with email confirmation. Configure custom SMTP, sender/domain verification, rate limits and appropriate anti-abuse controls.
6. Run two real account sessions: save/reopen, cross-account reads, concurrent saves, history, expired session, sign-out, email confirmation and password recovery. Test error handling while the provider is unavailable.
7. Define account/data deletion, backup retention, restoration ownership and migration rollback before broad release.

The integration uses server-only cookie sessions and verifies identity through Supabase Auth. The save transaction obtains its owner from `auth.uid()` and never accepts an owner ID from the client. Account rows are readable only by their owner. Clients cannot write project/revision tables directly. Saves are atomic, limited to 200 projects and 500 revisions per project, and rate limited to 40 saves per minute per account. Guest references still use the existing D1/R2 rules.

Machine binaries are deterministic for the same project/settings, allowing an exact SHA-256 comparison with sew-out evidence. JEF's header uses the writer's fixed release date; the package manifest carries the actual export timestamp.

## Deployment options

| Option                                   | Fit for this code                                                                                   | Work remaining                                                                                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing public Site + Supabase          | Recommended first release; preserves current URL, guest storage and working Cloudflare/Vinext build | Activate Supabase, finish live qualification, configure monitoring and backups, publish the reviewed version                                                         |
| Own Cloudflare Workers domain + Supabase | Closest standalone hosting path for this Worker app                                                 | Provision D1/R2 for existing guest/reference storage, port hosting bindings/config, migrate owned data, set secrets/domain and CI; validate permissions and rollback |
| Vercel + Supabase                        | Viable after a runtime migration; not a drop-in deployment of this checkout                         | Replace Cloudflare bindings and D1/R2 access, adapt to Next.js/Vercel build/runtime, requalify storage/auth/uploads and exports                                      |

Keep geometry/tracing work in browser workers. Hosted Workers have a 128 MB isolate limit; do not move large raster digitizing into the request handler without a separate bounded processing architecture. No new hosting subscription, domain purchase or public release is assumed by this options review.

## Source references

- Reshape workflow: [Wilcom reshape nodes](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/Modifying/reshape/Reshape_objects_with_reshape-nodes.htm). Shapes, stitch angles and entry/exit are separate controls.
- Specialty capabilities are hardware and format specific: [Wilcom sequin capabilities](https://docs.wilcom.com/embroiderystudio/e4/en/MainHelp/New_features/rn_-_update-4/Sequin_improvements_new_features.htm), [Chenille supplement](https://docs.wilcom.com/embroiderystudio/27/en/downloads/ChenilleSupplement.pdf).
- Binary layout references and independent decoder: [pyembroidery](https://github.com/EmbroidePy/pyembroidery), version 1.5.1. MIT notice retained in `vendor/pyembroidery-LICENSE.txt`.
- Thread catalogue source directory: [Madeira shade cards](https://www.madeira.com/hk-en/service/support/shade-cards). Published screen/PDF charts do not establish a calibrated complete dataset for this app.
- [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers static assets](https://developers.cloudflare.com/workers/static-assets/), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs). The relative migration effort above is an assessment of this checkout, not a provider guarantee.
