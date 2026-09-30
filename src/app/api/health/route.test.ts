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

const rawMongoError =
  "connect ECONNREFUSED cluster0-shard-00.internal.example:27017 via mongodb+srv://neon:hunter2@cluster0.internal.example";

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
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });

  it("reports missing MongoDB configuration as unready", async () => {
    mocks.tryGetMongoDb.mockResolvedValue({ db: null, mongo: "not-configured" });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      checks: { database: "not-configured" }
    });
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
  });

  it("reports connection failure without exposing or logging driver details", async () => {
    mocks.tryGetMongoDb.mockResolvedValue({
      db: null,
      mongo: "unavailable",
      error: rawMongoError
    });

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('"database":"unavailable"');
    expect(body).not.toContain("internal.example");
    expect(body).not.toContain("hunter2");
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "health.database.failed",
        fields: { stage: "connect" }
      }),
      rawMongoError
    );
  });

  it("reports and contains database ping failures", async () => {
    const error = new Error(rawMongoError);
    const command = vi.fn().mockRejectedValue(error);
    mocks.tryGetMongoDb.mockResolvedValue({
      db: { command },
      mongo: "connected"
    });

    const response = await GET();

    expect(command).toHaveBeenCalledWith({ ping: 1 });
    expect(response.status).toBe(503);
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "health.database.failed",
        fields: { stage: "ping" }
      }),
      error
    );
    expect(await response.text()).not.toContain("hunter2");
  });
});
