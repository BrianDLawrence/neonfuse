import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongoIndexes", () => ({ ensureGameIndexes: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/leaderboard", () => ({
  fetchHighScores: vi.fn(),
  wouldQualifyForLeaderboard: vi.fn()
}));

import { fetchHighScores, wouldQualifyForLeaderboard } from "@/lib/leaderboard";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { enforceRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

const player = { id: "discord-player", displayName: "Fuse Pilot", source: "web" as const };
const matchId = "64b7f0c2a1b2c3d4e5f60718";
const findOne = vi.fn();
const updateOne = vi.fn();
const db = { collection: vi.fn(() => ({ findOne, updateOne })) };

function submit() {
  return POST(
    new Request("http://localhost/api/high-scores", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ matchId })
    })
  );
}

function storedMatch(mode: string) {
  return {
    accountId: player.id,
    visitorId: "00000000-0000-4000-8000-000000000001",
    mode,
    winner: "player",
    durationMs: 40_000,
    blocksCleared: 9,
    score: 6000,
    createdAt: new Date("2026-11-01T12:00:00Z")
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.collection.mockImplementation(() => ({ findOne, updateOne }));
  updateOne.mockResolvedValue({});
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(ensureGameIndexes).mockResolvedValue();
  vi.mocked(fetchHighScores).mockResolvedValue([]);
  vi.mocked(wouldQualifyForLeaderboard).mockResolvedValue(true);
});

describe("high-scores route", () => {
  it("refuses to put a Daily Fuse round on the leaderboard", async () => {
    findOne.mockResolvedValue(storedMatch("daily"));

    const response = await submit();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "Daily Fuse rounds are not on the leaderboard" });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("still submits a Versus round", async () => {
    findOne.mockResolvedValue(storedMatch("player-vs-bot"));

    const response = await submit();

    expect(response.status).toBe(200);
    expect(updateOne).toHaveBeenCalledWith(
      { matchId },
      { $set: expect.objectContaining({ matchId, mode: "player-vs-bot" }) },
      { upsert: true }
    );
  });
});
