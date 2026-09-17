import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({ getMongoDb: vi.fn() }));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { getMongoDb } from "@/lib/mongodb";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { enforceRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

const player = {
  id: "player-a",
  displayName: "Alice",
  source: "web" as const
};
const validTrack = {
  id: "custom-track",
  title: "Custom Track",
  subtitle: "Test signal",
  inspiration: "Original test composition",
  bpm: 120,
  filterBase: 1200,
  accent: "cyan",
  layers: [
    {
      role: "lead",
      waveform: "square",
      pattern: ["a4", null],
      gain: 0.5
    }
  ],
  source: "custom"
};

function request() {
  return new Request("http://localhost/api/music/tracks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validTrack)
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MONGODB_URI", "mongodb://test");
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("custom music track writes", () => {
  it("stops rate-limited submissions before authentication", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue(
      Response.json({ ok: false }, { status: 429 }) as never
    );

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(getAuthenticatedPlayer).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated submissions", async () => {
    vi.mocked(getAuthenticatedPlayer).mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(getMongoDb).not.toHaveBeenCalled();
  });

  it("stores a valid submission only after authentication", async () => {
    const insertOne = vi.fn().mockResolvedValue({ insertedId: { toString: () => "track-id" } });
    const db = { collection: vi.fn(() => ({ insertOne })) };
    vi.mocked(getMongoDb).mockResolvedValue(db as never);

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ id: "custom-track" }));
    expect(payload).toMatchObject({ ok: true, stored: true, id: "track-id" });
  });
});
