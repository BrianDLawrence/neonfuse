import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { blockingVulnerabilities } from "./audit-policy.mjs";

const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024
});
try {
  if (result.error || ![0, 1].includes(result.status)) {
    throw result.error ?? new Error(result.stderr || "npm audit failed");
  }
  const report = JSON.parse(result.stdout);
  if (report.error) throw new Error(JSON.stringify(report.error));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const blocking = blockingVulnerabilities(report, lock);
  if (blocking.length) {
    console.error(JSON.stringify(report, null, 2));
    console.error(`Blocking high/critical vulnerabilities: ${blocking.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Security audit passed (only exception: dev-only GHSA-vfj7-8cjw-p6xm, if present).");
  }
} catch (error) {
  console.error("Security audit could not complete:", error.message);
  process.exitCode = 1;
}
