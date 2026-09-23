import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthConfigured: vi.fn(),
  tryGetMongoDb: vi.fn(),
  reportOperationalError: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ isAuthConfigured: mocks.isAuthConfigured }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: mocks.tryGetMongoDb }));
vi.mock("@/lib/server-observability", () => ({
  reportOperationalError: mocks.reportOperationalError
}));

import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("DISCORD_CLIENT_ID", "discord-client");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "discord-secret");
  vi.stubEnv("NEXT_PUBLIC_DISCORD_CLIENT_ID", "discord-client");
  vi.stubEnv("MULTIPLAYER_SECRET", "m".repeat(32));
  vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
  mocks.isAuthConfigured.mockReturnValue(true);
  mocks.tryGetMongoDb.mockResolvedValue({
    db: { command: vi.fn().mockResolvedValue({ ok: 1 }) },
    mongo: "connected"
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("reports ready only when every production dependency is ready", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "neon-fuse-web",
      status: "ready",
      checks: {
        database: "ready",
        authentication: "ready",
        discordActivity: "ready",
        multiplayerAdmission: "ready"
      }
    });
  });

  it("returns 503 without exposing a database driver's error details", async () => {
    mocks.tryGetMongoDb.mockResolvedValue({
      db: null,
      mongo: "unavailable",
      error: "mongodb://user:secret@example.test"
    });

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('"database":"unavailable"');
    expect(body).not.toContain("mongodb://");
    expect(body).not.toContain("secret");
  });

  it("reports and contains database ping failures", async () => {
    const error = new Error("private driver detail");
    mocks.tryGetMongoDb.mockResolvedValue({
      db: { command: vi.fn().mockRejectedValue(error) },
      mongo: "connected"
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "health.database.failed" }),
      error
    );
    expect(await response.text()).not.toContain("private driver detail");
  });
});
