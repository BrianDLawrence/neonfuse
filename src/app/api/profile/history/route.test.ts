import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongoIndexes", () => ({ ensureGameIndexes: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/player-career", () => ({
  loadPlayerCareer: vi.fn(),
  loadPlayerHistory: vi.fn()
}));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));
vi.mock("@/lib/player-profiles", () => ({ getOrCreatePlayerProfile: vi.fn() }));

import { tryGetMongoDb } from "@/lib/mongodb";
import { loadPlayerCareer, loadPlayerHistory } from "@/lib/player-career";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { getOrCreatePlayerProfile } from "@/lib/player-profiles";
import { GET } from "./route";

const player = { id: "player-a", displayName: "Alice", source: "web" as const };
const db = { collection: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(loadPlayerCareer).mockResolvedValue({
    local: { played: 0, wins: 0, losses: 0, draws: 0 },
    duel: { played: 1, wins: 1, losses: 0, draws: 0 },
    bestScore: 0,
    bestWinStreak: 1
  });
  vi.mocked(loadPlayerHistory).mockResolvedValue({ matches: [], nextCursor: null });
  vi.mocked(getOrCreatePlayerProfile).mockResolvedValue({
    created: false,
    profile: {
      progression: {
        xp: 0,
        level: 1,
        badges: [],
        unlockedTitles: ["fuse-initiate"],
        equippedTitle: "fuse-initiate"
      }
    } as never
  });
});

describe("profile history route", () => {
  it("rejects unauthenticated reads", async () => {
    vi.mocked(getAuthenticatedPlayer).mockResolvedValue(null);

    expect((await GET(new Request("http://localhost/api/profile/history"))).status).toBe(401);
    expect(loadPlayerHistory).not.toHaveBeenCalled();
  });

  it("validates bounded pagination input", async () => {
    const response = await GET(new Request("http://localhost/api/profile/history?limit=500"));

    expect(response.status).toBe(400);
    expect(loadPlayerHistory).not.toHaveBeenCalled();
  });

  it("loads only the authenticated player's career and history", async () => {
    const before = "2026-09-01T12:00:00.000Z";
    const response = await GET(
      new Request(`http://localhost/api/profile/history?limit=8&before=${encodeURIComponent(before)}`)
    );

    expect(response.status).toBe(200);
    expect(loadPlayerCareer).toHaveBeenCalledWith(db, player);
    expect(loadPlayerHistory).toHaveBeenCalledWith(db, player, 8, new Date(before));
    expect((await response.json()).progression.unlockedTitles).toContain("duel-certified");
  });
});
