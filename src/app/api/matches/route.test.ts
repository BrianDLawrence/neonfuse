import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongoIndexes", () => ({ ensureGameIndexes: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));
vi.mock("@/lib/player-career", () => ({ loadCampaignProgress: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/leaderboard", () => ({
  fetchHighScores: vi.fn(),
  wouldQualifyForLeaderboard: vi.fn()
}));

import { fetchHighScores, wouldQualifyForLeaderboard } from "@/lib/leaderboard";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { loadCampaignProgress } from "@/lib/player-career";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { enforceRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

const player = { id: "discord-player", displayName: "Fuse Pilot", source: "web" as const };
const insertOne = vi.fn();
const updateOne = vi.fn();
const db = { collection: vi.fn(() => ({ insertOne, updateOne })) };

function postMatch(body: unknown) {
  return POST(
    new Request("http://localhost/api/matches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  );
}

const campaignRound = {
  visitorId: "00000000-0000-4000-8000-000000000001",
  mode: "campaign",
  winner: "player",
  durationMs: 40_000,
  blocksCleared: 9
};

beforeEach(() => {
  vi.resetAllMocks();
  db.collection.mockImplementation(() => ({ insertOne, updateOne }));
  insertOne.mockResolvedValue({ insertedId: { toString: () => "match-1" } });
  updateOne.mockResolvedValue({});
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(ensureGameIndexes).mockResolvedValue();
  vi.mocked(fetchHighScores).mockResolvedValue([]);
  vi.mocked(wouldQualifyForLeaderboard).mockResolvedValue(true);
  vi.mocked(loadCampaignProgress).mockResolvedValue({ stages: {} });
});

describe("matches route", () => {
  it("rejects a campaign result without a stage before touching MongoDB", async () => {
    const response = await postMatch(campaignRound);

    expect(response.status).toBe(400);
    expect(tryGetMongoDb).not.toHaveBeenCalled();
  });

  it("rejects a campaign result for a stage the player has not unlocked", async () => {
    const response = await postMatch({ ...campaignRound, stageId: "1-2" });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ ok: false, error: "Stage is not unlocked" });
    expect(loadCampaignProgress).toHaveBeenCalledWith(db, player);
    expect(insertOne).not.toHaveBeenCalled();
  });

  it("stores a campaign result for an unlocked stage with its stage id", async () => {
    vi.mocked(loadCampaignProgress).mockResolvedValue({
      stages: { "1-1": { stars: 1, bestTimeMs: 70_000 } }
    });

    const response = await postMatch({ ...campaignRound, stageId: "1-2" });

    expect(response.status).toBe(200);
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: player.id, mode: "campaign", stageId: "1-2" })
    );
  });

  describe("Daily Fuse", () => {
    const dailyRound = { ...campaignRound, mode: "daily" };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 1, 12, 0, 0)));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stores today's result with its date, unranked", async () => {
      const response = await postMatch({ ...dailyRound, dateKey: "2026-11-01" });
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: player.id, mode: "daily", dateKey: "2026-11-01" })
      );
      expect(payload.qualifiesForLeaderboard).toBe(false);
      expect(payload.topScores).toEqual([]);
      expect(fetchHighScores).not.toHaveBeenCalled();
      expect(wouldQualifyForLeaderboard).not.toHaveBeenCalled();
      expect(loadCampaignProgress).not.toHaveBeenCalled();
    });

    it("accepts yesterday and tomorrow to tolerate local time zones", async () => {
      expect((await postMatch({ ...dailyRound, dateKey: "2026-10-31" })).status).toBe(200);
      expect((await postMatch({ ...dailyRound, dateKey: "2026-11-02" })).status).toBe(200);
    });

    it("rejects a stale or future date before touching MongoDB", async () => {
      for (const dateKey of ["2026-10-30", "2026-11-03", "2025-11-01"]) {
        const response = await postMatch({ ...dailyRound, dateKey });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ ok: false, error: "Daily Fuse date is outside the current window" });
      }

      expect(tryGetMongoDb).not.toHaveBeenCalled();
      expect(insertOne).not.toHaveBeenCalled();
    });

    it("rejects a missing or malformed date before touching MongoDB", async () => {
      expect((await postMatch(dailyRound)).status).toBe(400);
      expect((await postMatch({ ...dailyRound, dateKey: "2026-11-31" })).status).toBe(400);
      expect(tryGetMongoDb).not.toHaveBeenCalled();
    });

    it("reports an offline daily result as unranked", async () => {
      vi.mocked(tryGetMongoDb).mockResolvedValue({ db: null, mongo: "not-configured" });

      const payload = await (await postMatch({ ...dailyRound, dateKey: "2026-11-01" })).json();

      expect(payload).toEqual(expect.objectContaining({ ok: true, stored: false, qualifiesForLeaderboard: false }));
    });
  });

  it("does not check campaign progress for local matches", async () => {
    const response = await postMatch({ ...campaignRound, mode: "player-vs-bot" });

    expect(response.status).toBe(200);
    expect(loadCampaignProgress).not.toHaveBeenCalled();
    expect(insertOne).toHaveBeenCalledWith(expect.not.objectContaining({ stageId: expect.anything() }));
  });
});
