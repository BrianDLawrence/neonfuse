import { describe, expect, it } from "vitest";
import { blockingVulnerabilities } from "./audit-policy.mjs";

function fixture() {
  return {
    report: { auditReportVersion: 2, vulnerabilities: {
      braces: { severity: "high", nodes: ["node_modules/braces"], via: [
        { url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }
      ] },
      tooling: { severity: "high", nodes: ["node_modules/tooling"], via: ["braces"] }
    } },
    lock: { packages: { "node_modules/braces": { dev: true }, "node_modules/tooling": { dev: true } } }
  };
}

describe("security audit exception", () => {
  it("permits only the known development advisory and its propagated findings", () => {
    const { report, lock } = fixture();
    expect(blockingVulnerabilities(report, lock)).toEqual([]);
  });
  it("blocks the same advisory when used in production", () => {
    const { report, lock } = fixture();
    delete lock.packages["node_modules/braces"].dev;
    expect(blockingVulnerabilities(report, lock)).toEqual(["braces", "tooling"]);
  });
  it("blocks new advisories even on an exempt package", () => {
    const { report, lock } = fixture();
    report.vulnerabilities.braces.via.push({ url: "https://github.com/advisories/new-advisory" });
    expect(blockingVulnerabilities(report, lock)).toEqual(["braces", "tooling"]);
  });
  it("fails closed for missing dependencies and cyclic reports", () => {
    const { report, lock } = fixture();
    report.vulnerabilities.braces.via = ["tooling"];
    expect(blockingVulnerabilities(report, lock)).toEqual(["braces", "tooling"]);
    report.vulnerabilities.braces.via = ["missing"];
    expect(blockingVulnerabilities(report, lock)).toEqual(["braces", "tooling"]);
  });
  it("rejects unsupported reports", () => {
    expect(() => blockingVulnerabilities({}, {})).toThrow("Unsupported npm audit report");
  });
});
