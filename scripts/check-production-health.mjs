const ENDPOINTS = [
  ["web", process.env.APP_HEALTH_URL],
  ["realtime", process.env.REALTIME_HEALTH_URL]
];
const ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateEndpoint(name, rawUrl) {
  if (!rawUrl) {
    throw new Error(`${name} health URL is not configured`);
  }
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && process.env.ALLOW_INSECURE_HEALTH_URLS !== "true") {
    throw new Error(`${name} health URL must use HTTPS`);
  }
  return url;
}

async function check(name, rawUrl) {
  const url = validateEndpoint(name, rawUrl);
  let lastFailure = "unknown failure";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "neon-fuse-uptime/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) {
        throw new Error(`HTTP ${response.status}; status=${String(payload?.status ?? "unknown")}`);
      }
      console.info(`${name}: ${payload.status ?? "ready"} (${response.status})`);
      return;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "unknown failure";
      if (attempt < ATTEMPTS) await delay(attempt * 1000);
    }
  }

  throw new Error(`${name} health check failed after ${ATTEMPTS} attempts: ${lastFailure}`);
}

const results = await Promise.allSettled(
  ENDPOINTS.map(([name, url]) => check(name, url))
);
const failures = results.filter((result) => result.status === "rejected");

for (const failure of failures) {
  console.error(failure.reason instanceof Error ? failure.reason.message : "Health check failed");
}

if (failures.length) process.exitCode = 1;
