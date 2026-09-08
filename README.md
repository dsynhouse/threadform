# Threadform Studio

A browser embroidery studio for DSYN House: editable vector artwork, manual and automatic digitizing, stitch inspection, optimization, approval PDFs and native DST/PES/JEF/EXP output.

**Release 0.12 has passed 188 automated checks and a Chrome workflow audit; live-account and physical-machine qualification remain open.** See [the release checklist and interoperability roadmap](docs/INTEROPERABILITY.md). Algorithm tests do not establish Wilcom object recognition or physical sewing quality.

## Independent deployment

Threadform runs as a normal Next.js application on Vercel with Supabase for authentication, projects, immutable revisions, private artwork and inspiration boards. The public editor does not require a ChatGPT account. Follow [Supabase and Vercel setup](docs/DEPLOYMENT.md).

```sh
npm ci
cp .env.example .env.local
npm run dev:standalone
```

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env.local`. The Supabase migrations and Auth settings in the deployment guide are required for online saving. No service-role key belongs in this app. Without a connected backend, the editor can retain local recovery drafts and download editable projects.

```sh
npm run build:vercel
npm run start:standalone
```

The existing Sites deployment remains supported through its separate runtime adapter, D1/R2 bindings, Vite configuration and `npm run build`. Vercel uses `build:vercel`; it does not depend on Sites or a ChatGPT login.

## What changed in 0.12

- Patched framework and tooling advisories; the dependency audit reports zero known vulnerabilities. CI pins action revisions and rejects high/critical dependency advisories.
- Merged PR #6 and fixed a concurrent guest-save race that could remove the winning snapshot. Retries now claim an atomic save ID and use immutable content-addressed storage.
- Supabase rejects missing/invalid project versions and non-text names. Rate limits, stale revisions, account outages and invalid payloads now have distinct responses.
- Invalid snapshots can be corrected and saved again. Browser recovery retries after blocked or denied IndexedDB access; abandoned connections close cleanly.
- Project and inspiration pagination no longer clamps at offset 10,000. Invalid offsets fail with a clear request error.
- Extreme tatami/program-split allocations are rejected before exhausting memory. Contour and Island Coil report incomplete interiors instead of silently truncating them.
- Downloads retain a visible retry link, sliders expose their accessible names, and Column A/B/C help matches the actual input stages.
- The standalone launcher uses Next.js production environment loading, copies its assets and forwards shutdown signals.

See the [audit and remaining qualification gates](docs/qualification/release-0.12.md) for evidence, scope and known limits.

## What changed in 0.11

- Convert uses one dedicated scroll area with short-window height handling, keyboard focus and retained conversion state.
- **Objects → Reference artwork** inserts an original image without conversion. Hide/show, dim/undim, adjustable opacity, position locking, mm/in placement and rotation remain editable and undoable.
- Reference images are cached with their owner's local recovery state and uploaded privately when Supabase is configured. Bitmap conversion attaches the original behind the vectors; a failed cloud upload preserves local work and offers retry.
- Column A/B/C have live footprints and next-point guides. Backspace returns through captured edges/width stages; Escape clears Column C correctly. Alt temporarily bypasses snap.
- Freehand sketching uses coalesced pointer samples, adjustable smoothing and exact released endpoints. Finishing a drawing leaves its tool ready for the next object.
- Supabase client versions are pinned. The supplied project URL is prefilled in `.env.example`; the publishable key and live provider activation remain required.

## What changed in 0.10

- Canvas-only trackpad zoom and panning, with a plus-shaped needle indicator.
- Ordered Center Run, Edge Run, Zigzag, Double Zigzag and Tatami underlays with independent settings.
- Editable maximum satin stitch length and improved auto-digitizing foundations.
- Reviewed CIEDE2000 thread-chart assignment preserving artwork RGB, and correct changes between different thread codes sharing a display colour.
- Wilcom handoff packages preserving source object and underlay semantics. This is an open exchange package, **not a native EMB converter**.

## What changed in 0.9

- Convert has a constrained scroll container, persistent local drafts and border-connected background removal that preserves interior whites. Correct selected colours and assign embroidery, print, fabric or reference roles without retracing.
- Hiding objects affects viewing only. **Include in sewing** explicitly controls needle output. Legacy excluded objects retain their previous behavior when reopened.
- Autosave, recovery checkpoints, account-separated drafts, revision conflicts and stable retry identifiers preserve work. Reopen saved workspace, selection, zoom, units and playback position.
- Column A retains alternating edge pairs, Column B retains independently editable unequal edges, and Column C captures a centreline followed by width/offset references. Corner/curve flags and Bézier handles remain editable. Enter/Space final-stitch handling and endpoint continuation are supported.
- Geometry workers ignore non-sewing metadata changes; the last good preview remains visible during regeneration. Pending or failed plans cannot be exported.
- Supabase storage retains source artwork and trace settings. Larger project snapshots use signed direct uploads, then server validation and an atomic revision save.

## Workspaces

Studio, Optimize, Convert, Analysis, Inspiration and Production provide 32 stitch methods, shape cutting/Boolean operations, motifs, lettering, repeats, colour controls, freeform drawing, stitch playback, thread assignments and export packages. The embroidery engine is original code based on public workflow references; it does not use Wilcom's proprietary digitizing engine.

## Verification

Node 24 and Python 3.12 are used for the full check suite. Python is needed only for independent embroidery-format decoding tests, not for running the app.

```sh
python -m pip install -r tests/requirements-formats.txt
npm run check:types
npm run lint
npm run check:all
npm run build:vercel
npm run build
node --test tests/*.test.mjs
```

GitHub Actions runs the same gates on pushes and pull requests. Browser interaction, live Supabase email delivery, real account migration, download completion and physical sew-outs remain distinct qualification gates.

## Code layout

- `lib/embroidery`: geometry, tracing, stitch generation, validation, optimization, thread metadata and machine encoders.
- `components/studio` and `components/embroidery-canvas.tsx`: workspaces and direct editing.
- `hooks`: recovery, immutable editing history and cancellable worker orchestration.
- `lib/client`: IndexedDB drafts and authenticated artwork transfers.
- `app/api` and `lib/server`: verified-cookie sessions, owner checks, project revisions, references and storage.
- `supabase/migrations`: append-only PostgreSQL/RLS and private bucket setup.
- `drizzle`, `db`, `worker`, `build`: compatibility with the existing Sites backend.
- `tests`, `scripts/check-*`: algorithm, independent decoding, SQL isolation and built-server regression checks.

## Practical limits

Artwork dimensions have no fixed maximum; the app stores finite millimetre geometry and displays mm or inches. Machine fields and binary-format limits apply at export. Resource budgets remain explicit: 32 MB imports, 8 MB online project snapshots, 150,000 aggregate vector-work units, bounded bitmap/worker processing and 350,000 stitch commands. Large works may require sections; automated multi-field registration is still planned.

Native stitch formats do not preserve Threadform objects as native Wilcom EMB objects. Continuous tatami routing survives independent decoding, but Wilcom recognition and actual controller behavior require external testing. Specialty hardware functions beyond the implemented DST sequin controls remain machine-specific work. Complete measured thread catalogues require licensed manufacturer data and physical calibration records.

Pinterest public searches and saved references are available. Live Pinterest OAuth still needs developer credentials and qualification; its existing OAuth persistence is currently Sites-specific. See [Pinterest setup](docs/PINTEREST-SETUP.md). Older release documents are historical; the current status is in [INTEROPERABILITY.md](docs/INTEROPERABILITY.md).
