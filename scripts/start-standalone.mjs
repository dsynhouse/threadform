// next.config.ts sets output: "standalone", so `next build` emits a
// self-contained server at .next/standalone/server.js. Two things follow that
// `next start` does not handle:
//
//   1. Next refuses standalone output from `next start` ("does not work with
//      output: standalone"), so the documented self-host command was running an
//      unsupported path.
//   2. Next deliberately does not copy .next/static or public/ into the
//      standalone directory. A server started without them serves HTML but no
//      CSS, JS chunks or fonts.
//
// Copy those assets, then hand off to the real standalone server.
import { cpSync, existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");
const server = join(standalone, "server.js");

if (!existsSync(server)) {
  console.error(
    "No standalone build found at .next/standalone/server.js.\n" +
      "Run `npm run build:vercel` first.",
  );
  process.exit(1);
}

for (const [from, to] of [
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
  [join(root, "public"), join(standalone, "public")],
])
  if (existsSync(from)) cpSync(from, to, { recursive: true });

// The standalone server runs from its own directory, so Next would look for
// .env files there rather than in the project. Load the project's files here
// and pass them down, matching Next's own precedence: a real environment
// variable beats .env.local, which beats .env. Without this, SUPABASE_URL and
// SUPABASE_PUBLISHABLE_KEY go unseen and the app silently degrades to
// local-only drafts with /?account=unavailable.
const fromFiles = {};
for (const name of [".env", ".env.local"]) {
  const file = join(root, name);
  if (!existsSync(file)) continue;
  Object.assign(fromFiles, parseEnv(readFileSync(file, "utf8")));
}

spawn(process.execPath, [server], {
  stdio: "inherit",
  cwd: standalone,
  env: { ...fromFiles, ...process.env },
}).on("exit", (code) => process.exit(code ?? 0));
