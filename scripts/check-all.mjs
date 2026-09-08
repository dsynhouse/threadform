import { spawnSync } from "node:child_process";
for (const suite of [
  "embroidery",
  "workshop",
  "digitizing",
  "refinement",
  "production",
  "tatami",
  "coherence",
  "workspace",
  "workflow",
  "interop",
  "supabase",
  "transfers",
]) {
  const result = spawnSync(process.execPath, [`scripts/check-${suite}.mjs`], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
