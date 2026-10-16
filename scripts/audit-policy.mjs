// Temporary exception: no patched braces release exists as of 2026-10-14.
// Next's ESLint plugin uses it only for repository-controlled file patterns.
// Review/remove when upstream fixes GHSA-vfj7-8cjw-p6xm; never exempt runtime use.
const exception = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";

export function blockingVulnerabilities(report, lock) {
  if (report.auditReportVersion !== 2 || !report.vulnerabilities) {
    throw new Error("Unsupported npm audit report");
  }
  const vulnerabilities = report.vulnerabilities;
  function exempt(name, seen = new Set()) {
    const item = vulnerabilities[name];
    if (!item || seen.has(name) || !item.nodes?.length || !item.via?.length) return false;
    if (!item.nodes.every((path) => lock.packages[path]?.dev === true)) return false;
    const visited = new Set([...seen, name]);
    return item.via.every((cause) => typeof cause === "string"
      ? exempt(cause, visited)
      : name === "braces" && cause.url === exception);
  }
  return Object.keys(vulnerabilities).filter((name) =>
    ["high", "critical"].includes(vulnerabilities[name].severity) && !exempt(name));
}
