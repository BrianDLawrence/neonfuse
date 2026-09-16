import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongoIndexes", () => ({ ensureGameIndexes: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));
vi.mock("@/lib/player-career", () => ({ loadPlayerCareer: vi.fn() }));
vi.mock("@/lib/player-profiles", () => ({
  getOrCreatePlayerProfile: vi.fn(),
  updatePlayerProfile: vi.fn()
}));

import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { loadPlayerCareer } from "@/lib/player-career";
import { getOrCreatePlayerProfile, updatePlayerProfile } from "@/lib/player-profiles";
import { GET, PATCH } from "./route";

const player = {
  id: "discord-player",
  displayName: "Fuse Pilot",
  source: "web" as const
};
const db = { collection: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(ensureGameIndexes).mockResolvedValue();
  vi.mocked(loadPlayerCareer).mockResolvedValue({
    local: { played: 1, wins: 1, losses: 0, draws: 0 },
    duel: { played: 0, wins: 0, losses: 0, draws: 0 },
    bestScore: 4500,
    bestWinStreak: 0
  });
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
      profile: { playerId: player.id, stats: {} } as never
    });

    const response = await GET(new Request("http://localhost/api/profile"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(loadPlayerCareer).toHaveBeenCalledWith(db, player);
    expect(payload.profile.stats.bestScore).toBe(4500);
  });

  it("applies a valid preference patch to the authenticated player only", async () => {
    vi.mocked(updatePlayerProfile).mockResolvedValue({ playerId: player.id } as never);

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
});
