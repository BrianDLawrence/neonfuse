import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { loadDailyProgress, loadPlayerCareer, summarizePlayerCareer } from "./player-career";

const player = { id: "discord-player", displayName: "Fuse Pilot", source: "web" as const };

/** A stand-in for the two collection reads the career loaders make. */
function fakeDb(rows: Record<string, unknown[]>) {
  const find = vi.fn();
  const db = {
    collection: (name: string) => ({
      find: (...args: unknown[]) => {
        find(...args);
        const cursor = { sort: () => cursor, toArray: async () => rows[name] ?? [] };
        return cursor;
      }
    })
  };

  return { db: db as never as Db, find };
}

describe("summarizePlayerCareer", () => {
  it("keeps unranked local and authoritative duel records separate", () => {
    const career = summarizePlayerCareer(
      [
        { winner: "player", score: 4200 },
        { winner: "bot", score: 900 },
        { winner: "draw", score: 1700 }
      ],
      [{ winnerId: "player-a" }, { winnerId: "player-b" }, { winnerId: null }],
      "player-a"
    );

    expect(career.local).toEqual({ played: 3, wins: 1, losses: 1, draws: 1 });
    expect(career.duel).toEqual({ played: 3, wins: 1, losses: 1, draws: 1 });
    expect(career.bestScore).toBe(4200);
  });

  it("calculates the best authoritative duel win streak in chronological order", () => {
    const career = summarizePlayerCareer(
      [],
      [
        { winnerId: "player-a" },
        { winnerId: "player-a" },
        { winnerId: "player-b" },
        { winnerId: "player-a" },
        { winnerId: "player-a" },
        { winnerId: "player-a" },
        { winnerId: null }
      ],
      "player-a"
    );

    expect(career.bestWinStreak).toBe(3);
  });

  it("returns zeroed statistics for a new player", () => {
    expect(summarizePlayerCareer([], [], "new-player")).toEqual({
      local: { played: 0, wins: 0, losses: 0, draws: 0 },
      duel: { played: 0, wins: 0, losses: 0, draws: 0 },
      bestScore: 0,
      bestWinStreak: 0
    });
  });
});

describe("career loaders", () => {
  it("counts Daily Fuse rounds as local matches", async () => {
    const { db, find } = fakeDb({ matches: [], duel_results: [] });

    await loadPlayerCareer(db, player);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ mode: { $in: ["player-vs-bot", "campaign", "daily"] } }),
      expect.anything()
    );
  });

  it("derives the Daily Fuse streak from stored daily wins only", async () => {
    const { db, find } = fakeDb({
      matches: [
        { dateKey: "2026-10-31", durationMs: 50_000 },
        { dateKey: "2026-11-01", durationMs: 40_000 },
        { dateKey: "2026-11-01", durationMs: 70_000 },
        { durationMs: 10_000 }
      ]
    });

    const progress = await loadDailyProgress(db, player);

    expect(find).toHaveBeenCalledWith(
      { accountId: player.id, mode: "daily", winner: "player" },
      { projection: { dateKey: 1, durationMs: 1 } }
    );
    expect(progress).toEqual(
      expect.objectContaining({ totalClears: 2, longestStreak: 2, runLength: 2, bestTimeMs: 40_000 })
    );
  });
});
