import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongoIndexes", () => ({ ensureGameIndexes: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));
vi.mock("@/lib/player-career", () => ({
  loadPlayerCareer: vi.fn(),
  loadCampaignProgress: vi.fn(),
  loadDailyProgress: vi.fn()
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/player-profiles", () => ({
  getOrCreatePlayerProfile: vi.fn(),
  updatePlayerProfile: vi.fn()
}));

import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { loadCampaignProgress, loadDailyProgress, loadPlayerCareer } from "@/lib/player-career";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getOrCreatePlayerProfile, updatePlayerProfile } from "@/lib/player-profiles";
import { getActStages } from "@/game/simulation/campaign";
import { GET, PATCH } from "./route";

const player = {
  id: "discord-player",
  displayName: "Fuse Pilot",
  source: "web" as const
};
const db = { collection: vi.fn() };
const storedProgression = {
  xp: 0,
  level: 1,
  badges: [],
  unlockedTitles: ["fuse-initiate"],
  equippedTitle: "fuse-initiate"
} as const;

const dailyProgress = {
  totalClears: 4,
  longestStreak: 3,
  runLength: 2,
  lastClearedKey: "2026-11-01",
  bestTimeMs: 41_000,
  recent: { "2026-11-01": 41_000, "2026-10-31": 52_000 }
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(ensureGameIndexes).mockResolvedValue();
  vi.mocked(loadPlayerCareer).mockResolvedValue({
    local: { played: 1, wins: 1, losses: 0, draws: 0 },
    duel: { played: 0, wins: 0, losses: 0, draws: 0 },
    party: { played: 0, wins: 0, losses: 0, draws: 0 },
    partySeriesWins: 0,
    bestScore: 4500,
    bestWinStreak: 0
  });
  vi.mocked(loadCampaignProgress).mockResolvedValue({
    stages: { "1-1": { stars: 2, bestTimeMs: 48_000 } }
  });
  vi.mocked(loadDailyProgress).mockResolvedValue(dailyProgress);
});

describe("profile route", () => {
  it("rejects unauthenticated profile reads before touching MongoDB", async () => {
    vi.mocked(getAuthenticatedPlayer).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/profile"));

    expect(response.status).toBe(401);
    expect(tryGetMongoDb).not.toHaveBeenCalled();
    expect(getOrCreatePlayerProfile).not.toHaveBeenCalled();
  });

  it("rejects attempts to write server-owned progression", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: { musicEnabled: true }, progression: { xp: 50 } })
      })
    );

    expect(response.status).toBe(400);
    expect(updatePlayerProfile).not.toHaveBeenCalled();
  });

  it("returns career statistics derived from stored match results", async () => {
    vi.mocked(getOrCreatePlayerProfile).mockResolvedValue({
      created: false,
      profile: { playerId: player.id, stats: {}, progression: storedProgression } as never
    });

    const response = await GET(new Request("http://localhost/api/profile"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(loadPlayerCareer).toHaveBeenCalledWith(db, player);
    expect(payload.profile.stats.bestScore).toBe(4500);
    expect(payload.profile.progression.unlockedTitles).toContain("arena-breaker");
  });

  it("returns campaign progress derived from stored campaign rounds", async () => {
    vi.mocked(getOrCreatePlayerProfile).mockResolvedValue({
      created: false,
      profile: { playerId: player.id, stats: {}, progression: storedProgression } as never
    });

    const response = await GET(new Request("http://localhost/api/profile"));
    const payload = await response.json();

    expect(loadCampaignProgress).toHaveBeenCalledWith(db, player);
    expect(payload.campaign.stages["1-1"]).toEqual({ stars: 2, bestTimeMs: 48_000 });
  });

  it("returns the Daily Fuse streak derived from stored daily rounds", async () => {
    vi.mocked(getOrCreatePlayerProfile).mockResolvedValue({
      created: false,
      profile: { playerId: player.id, stats: {}, progression: storedProgression } as never
    });

    const response = await GET(new Request("http://localhost/api/profile"));
    const payload = await response.json();

    expect(loadDailyProgress).toHaveBeenCalledWith(db, player);
    expect(payload.daily).toEqual(dailyProgress);
  });

  it("applies a valid preference patch to the authenticated player only", async () => {
    vi.mocked(updatePlayerProfile).mockResolvedValue({
      playerId: player.id,
      progression: storedProgression
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: { musicVolume: 6 } })
      })
    );

    expect(response.status).toBe(200);
    expect(updatePlayerProfile).toHaveBeenCalledWith(db, player, {
      preferences: { musicVolume: 6 }
    });
  });

  it("rejects a known title until the authenticated player has unlocked it", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equippedTitle: "duel-certified" })
      })
    );

    expect(response.status).toBe(403);
    expect(updatePlayerProfile).not.toHaveBeenCalled();
  });

  it("rejects a campaign act title until every stage of that act is cleared", async () => {
    // beforeEach only clears stage 1-1, which is not the whole of Act 1.
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equippedTitle: "ladder-climber" })
      })
    );

    expect(response.status).toBe(403);
    expect(loadCampaignProgress).toHaveBeenCalledWith(db, player);
    expect(updatePlayerProfile).not.toHaveBeenCalled();
  });

  it("persists a campaign act title once the act is cleared", async () => {
    vi.mocked(loadCampaignProgress).mockResolvedValue({
      stages: Object.fromEntries(
        getActStages(1).map((stage) => [stage.id, { stars: 1, bestTimeMs: 60_000 }])
      )
    });
    vi.mocked(updatePlayerProfile).mockResolvedValue({
      playerId: player.id,
      progression: { ...storedProgression, equippedTitle: "ladder-climber" }
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equippedTitle: "ladder-climber" })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updatePlayerProfile).toHaveBeenCalledWith(db, player, { equippedTitle: "ladder-climber" });
    expect(payload.profile.progression.equippedTitle).toBe("ladder-climber");
    expect(payload.profile.progression.unlockedTitles).toContain("ladder-climber");
  });

  it("derives act-clear badges on profile reads from stored campaign rounds", async () => {
    vi.mocked(loadCampaignProgress).mockResolvedValue({
      stages: Object.fromEntries(
        getActStages(1).map((stage) => [stage.id, { stars: 1, bestTimeMs: 60_000 }])
      )
    });
    vi.mocked(getOrCreatePlayerProfile).mockResolvedValue({
      created: false,
      profile: {
        playerId: player.id,
        stats: {},
        progression: { ...storedProgression, equippedTitle: "ladder-climber" }
      } as never
    });

    const payload = await (await GET(new Request("http://localhost/api/profile"))).json();

    expect(payload.profile.progression.badges).toContain("ladder-climber");
    expect(payload.profile.progression.equippedTitle).toBe("ladder-climber");
  });

  it("persists an equipped title after deriving its unlock from career facts", async () => {
    vi.mocked(updatePlayerProfile).mockResolvedValue({
      playerId: player.id,
      progression: { ...storedProgression, equippedTitle: "arena-breaker" }
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ equippedTitle: "arena-breaker" })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(updatePlayerProfile).toHaveBeenCalledWith(db, player, {
      equippedTitle: "arena-breaker"
    });
    expect(payload.profile.progression.equippedTitle).toBe("arena-breaker");
  });
});
