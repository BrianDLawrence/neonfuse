// Builds the bundle the browser tests serve. playwright.config.ts supplies the env:
// NEXT_DIST_DIR keeps it out of .next, and the fake public Discord and realtime
// values are baked in here instead of into the `npm run build` output.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// next build rewrites these two for a custom distDir; restore them so the checkout stays clean.
const rewritten = ["next-env.d.ts", "tsconfig.json"].map((file) => [file, readFileSync(file, "utf8")]);

try {
  const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  for (const [file, content] of rewritten) writeFileSync(file, content);
}
