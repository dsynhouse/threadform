# Supabase and independent deployment

Audited 8 September 2026. The complete source is in [dsynhouse/threadform](https://github.com/dsynhouse/threadform); PR #6 is merged. GitHub Actions passed on the merge, and GitHub reports its Vercel deployment as successful. The selected Supabase project `wnjsliqsktxyfmuzcqxx` is reachable through its management connection, has six applied migrations and reports schema version 4. Live SQL checks confirmed the new save-payload guards and restrictive grants.

The Vercel connector token cannot access the `dsyn-houses-projects` team (403). Its environment settings, production aliases and Auth callbacks therefore remain unverified. Reauthorize that team before changing them. The project URL and enabled publishable key are available through Supabase; no keys are committed here. Actual signup, guest linking, recovery email, cross-device resume and private Storage delivery require end-to-end qualification on the final domain. See [the release audit](qualification/release-0.12.md).

## Runtime choice

| Target             | Build                                               | Persistence                                                        | Use                                                                      |
| ------------------ | --------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Vercel             | `npm run build:vercel`                              | Supabase Auth, Postgres and private Storage                        | Independent managed deployment; `vercel.json` selects the correct build. |
| Any Node 24 host   | Same Next.js build, then `npm run start:standalone` | Supabase                                                           | Container or managed Node hosting with HTTPS.                            |
| Existing Sites app | `npm run build`                                     | Existing guest D1/R2; Supabase for signed-in users when configured | Compatibility path; no guest-data migration is silently performed.       |

Vercel supports Node 24 for builds and functions. The repository specifies `24.x`. The editor's stitch and tracing workers run in the browser. Python is a test dependency only. [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

## 1. Prepare the selected Supabase project

Use the selected [Threadform Supabase project](https://supabase.com/dashboard/project/wnjsliqsktxyfmuzcqxx). Its applied migration history now matches the six files in `supabase/migrations/`, ending at `20260908100437_validate_save_payload.sql`. The schema-version and foreign-key-index files were renamed to the versions actually recorded by Supabase. Do not rerun the initial migration over existing tables. For a new environment, apply all migrations in filename order; for an existing environment, compare its migration history before applying only missing files.

The legacy Sites guest database separately requires `drizzle/0002_atomic_guest_retries.sql`; it is included in the Sites deployment package. Back up the target database before manual migrations.

The migrations create private projects, immutable revisions, a last-workspace record, artwork metadata, reference boards and the `threadform-artwork` private bucket. Every account table has owner-based RLS; the save transaction checks `auth.uid()`, expected revision and save identifier. It retains a 40-save/minute rate limit and 8 MiB snapshot budget while removing the old 400-object, 200-project and 500-revision quotas.

In Auth settings:

1. Enable email/password authentication, email confirmation and password recovery.
2. Enable anonymous sign-ins for guest online saving on the independent deployment.
3. Enable manual identity linking so a guest can add an email to the same user ID. The app verifies email before the password-setup stage; this preserves guest project ownership. Signing into an existing different account deliberately opens that account's workspace.
4. Set the production Site URL and allow the exact callback URLs below. Add localhost callbacks for development separately; avoid broad production wildcards.
5. Configure a custom SMTP provider and verified sender for real user email delivery. Supabase's default mail service is restricted and is not a production email-delivery solution.

Callbacks, replacing `YOUR-DOMAIN` with the final app domain:

```text
https://YOUR-DOMAIN/auth/callback
https://YOUR-DOMAIN/auth/callback?setup=1
https://YOUR-DOMAIN/auth/callback?recovery=1
```

For development, use the corresponding `http://localhost:3000` URLs. A PKCE link should be opened in the same browser that initiated it. Test the actual confirmation and recovery templates before launch. [Anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

Anonymous sign-ups incur real database/storage usage. Before opening a public production service, qualify abuse controls, CAPTCHA support, cleanup and cost limits for the chosen project. The current app uses provider authentication rate limits but does not yet implement a CAPTCHA challenge flow or automated anonymous-user cleanup.

## 2. Set application environment values

Add these two values to the hosting environment. For local development, copy `.env.example` to ignored `.env.local`.

| Variable                   | Value                                        |
| -------------------------- | -------------------------------------------- |
| `SUPABASE_URL`             | `https://wnjsliqsktxyfmuzcqxx.supabase.co`   |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key, or legacy anon key |

No service-role key is required. The app rejects secret/service-role keys. Session cookies are HttpOnly, Secure in production and SameSite=Lax. Server authorization verifies the user with Supabase rather than trusting cookie contents. Signed upload responses expose only the public key and a bounded upload token. [Supabase server clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)

Small projects use the normal JSON API. Larger writes upload to the private bucket first; the server verifies byte count and SHA-256, validates the project and commits the revision atomically. Large reads use a signed, checksummed project file. This covers both sides of Vercel's 4.5 MB request/response limit. Originals and transport snapshots are private; define an orphan/cache retention job before launch. [Vercel payload limits](https://vercel.com/docs/functions/limitations), [signed uploads](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl)

## 3. Export to GitHub and deploy on Vercel

The user selected the existing public repository [dsynhouse/threadform](https://github.com/dsynhouse/threadform). Native GitHub access confirms push permission. Upload the complete reviewed source, including the lockfile, `supabase/`, `public/`, `vendor/`, scripts and workflows. Exclude `.env.local`, `node_modules`, `.next`, `dist`, local database state and credentials; these are already ignored. The repository includes the Sites runtime adapter for continuity, but the Vercel build is independent.

The existing Vercel Git integration is already reporting deployments for `dsynhouse/threadform`. After restoring team access, verify Next.js and Node 24, then set both Supabase environment variables for the intended deployment environments. Keep the production branch `main`. Once the Git integration is active, pushes to `main` update the stable production domain and other branches get preview URLs. Do not clone a second repository for this app: continued updates belong to the original repository. [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github) `vercel.json` uses `npm ci` and `npm run build:vercel`. Finish Supabase callback configuration for the assigned domain before inviting users. Use an isolated Supabase project for untrusted preview branches; do not share production data with every preview.

GitHub Actions verifies algorithms, SQL isolation, TypeScript, lint and both build targets. GitHub-hosted execution passed on the PR #6 merge; verify each subsequent release run before promotion. Workflow action references follow the official [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) and [setup-python](https://github.com/actions/setup-python) usage. The action revisions are pinned to the verified v7 commit SHAs, and CI now rejects high/critical npm advisories. Enable branch protection before a controlled production release.

The user-supplied project reference is an identifier, not an API key. Obtain the **publishable** key from the project's API Keys settings. The application checks for an actual public key and will not claim online saving from the URL alone. [Supabase keys](https://supabase.com/docs/guides/getting-started/api-keys)

The 2026 Supabase changelog was reviewed: this repo uses Node 24 and TypeScript 5.9, and the migrations explicitly grant intended table/function privileges rather than relying on automatic Data API exposure. Hosted Supabase still needs its real schema, Auth and Storage acceptance checks. [Supabase changelog](https://supabase.com/changelog)

## 4. Activation acceptance checklist

- [ ] Auth signup email reaches a real recipient; confirmation, sign-in, reset and sign-out work on the final HTTPS domain.
- [ ] A guest can create a design, link a new email, set a password and reopen the same design on another device.
- [ ] Signing into a different existing account opens that account's projects without silently transferring private work.
- [ ] Two real accounts cannot read one another's projects, revisions, assets or reference images.
- [ ] Original artwork, exact trace options and local corrections reopen after reload; linked source is accessible on another device.
- [ ] A project above 4.5 MB can upload, save and reopen through the signed-file path.
- [ ] A save response lost after commit retries with the same identifier; newer local edits stay unsaved until acknowledged.
- [ ] Conflicting tabs preserve both drafts; sign-out in one tab prevents another tab saving under the old namespace.
- [ ] PDF/SVG/machine downloads complete in each supported browser.
- [ ] Backup restore and orphan/anonymous-account cleanup have been rehearsed with test data.
- [ ] Monitoring reports auth/save/storage failures without logging designs, passwords, tokens or private signed URLs.

The existing Sites guest database and browser recovery store are not automatically transferable to another domain. Before a domain move, export valuable guest projects from the old site and import them while signed into the new account. Bulk authenticated migration needs a separately reviewed owner mapping and verification report.

## Pinterest

Saved inspiration boards use Supabase on the independent runtime. Public Pinterest searches remain external links. The earlier Pinterest OAuth connection store still uses Sites D1 and needs porting before enabling Pinterest developer credentials on Vercel. Do not configure those optional credentials on the standalone deployment until that adapter and provider flow are qualified. This limitation does not affect project login, saving, artwork or reference boards.

## Audit notes

Supabase's advisor flags `save_threadform_project` because authenticated users can execute a `SECURITY DEFINER` function. This is intentional: direct project/revision writes are denied and the RPC performs the authorized atomic save after checking `auth.uid()`, ownership, expected revision and save ID. Anonymous API clients cannot execute it. Review that contract whenever the RPC changes; do not suppress the advisor or grant direct writes to silence it. [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)

Define and rehearse backup restoration, orphan-artwork cleanup, snapshot retention and abuse/cost controls before public production. The empty/new database's unused-index notices are informational; they are not grounds to drop ownership and foreign-key indexes. A successful deployment status establishes that a build deployed, not that Auth emails, every browser, or physical embroidery have been qualified.
