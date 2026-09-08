# Release 0.10 verification

8 September 2026. Local software verification passed. This is not a machine or Wilcom interoperability certification.

| Check group | Passed |
| --- | ---: |
| Embroidery geometry and exports | 23 |
| Shape workshop | 14 |
| Digitizing | 12 |
| Refinement | 15 |
| Production formats and profiles | 13 |
| Tatami construction | 8 |
| Stitch continuity and independent decoding | 12 |
| Workspace size and units | 7 |
| Editing, source retention and columns | 12 |
| Underlays, thread matching, handoff and navigation | 13 |
| PostgreSQL transactions and account isolation | 11 |
| Large project transfers | 3 |
| Built server and shared UI | 16 |
| **Total** | **159** |

TypeScript, ESLint, the Next.js Vercel build and the Sites/Vinext build passed. Format tests use pyembroidery 1.5.1 independently of the app's encoders. Database tests execute migrations in a local PostgreSQL-compatible PGlite instance; they do not verify the connected account's live Supabase configuration. Event tests dispatch cancelable wheel and gesture events and verify pointer-preserving camera maths; they are not a real Mac trackpad browser test.

Test-driven fixes in this release include preserving exact zero-inset Column C boundaries, enforcing the selected underlay length on connecting stitches and distinguishing physical thread-code changes when RGB matches. Legacy hole and continuous-fill cases remain in the full regression suite.

Commands:

```sh
npm run check:types
npm run lint
npm run check:all
npm run build:vercel
npm run build
node --test tests/*.test.mjs
```

Still required before production qualification: real browser gesture/download tests, Supabase project activation and account/email flows, GitHub-hosted CI confirmation, Vercel deployment, target-version Wilcom object recognition/EMB round trips and physical machine sew-outs. [The interoperability checklist](../INTEROPERABILITY.md) defines acceptance evidence for these gates.
