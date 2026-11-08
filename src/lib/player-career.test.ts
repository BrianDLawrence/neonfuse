import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { loadDailyProgress, loadPlayerCareer, loadPlayerHistory, summarizePlayerCareer } from "./player-career";

const player = { id: "discord-player", displayName: "Fuse Pilot", source: "web" as const };

/** A stand-in for the two collection reads the career loaders make. */
function fakeDb(rows: Record<string, unknown[]>) {
  const find = vi.fn();
  const db = {
    collection: (name: string) => ({
      find: (...args: unknown[]) => {
        find(...args);
        const cursor = { sort: () => cursor, limit: () => cursor, toArray: async () => rows[name] ?? [] };
        return cursor;
      },
      countDocuments: async () => (rows[name] ?? []).length
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
      party: { played: 0, wins: 0, losses: 0, draws: 0 },
      partySeriesWins: 0,
      bestScore: 0,
      bestWinStreak: 0
    });
  });

  it("keeps Party Brawl rounds out of duel records and streaks", () => {
    const career = summarizePlayerCareer(
      [],
      [
        { winnerId: "player-a" },
        { winnerId: null, mode: "party", outcome: "bot" },
        { winnerId: "player-a", mode: "party", outcome: "human" },
        { winnerId: null, mode: "party", outcome: "draw" },
        { winnerId: "player-a" }
      ],
      "player-a",
      1
    );

    expect(career.duel).toEqual({ played: 2, wins: 2, losses: 0, draws: 0 });
    expect(career.bestWinStreak).toBe(2);
    expect(career.party).toEqual({ played: 3, wins: 1, losses: 1, draws: 1 });
    expect(career.partySeriesWins).toBe(1);
  });
});

describe("career loaders", () => {
  it("reads party rounds and series wins without counting them as duels", async () => {
    const { db } = fakeDb({
      matches: [],
      duel_results: [
        { winnerId: null, mode: "party", outcome: "bot" },
        { winnerId: player.id, mode: "party", outcome: "human" }
      ],
      party_series: [{ winner: { kind: "human", playerId: player.id } }]
    });

    const career = await loadPlayerCareer(db, player);

    expect(career.duel.played).toBe(0);
    expect(career.party).toEqual({ played: 2, wins: 1, losses: 1, draws: 0 });
    expect(career.partySeriesWins).toBe(1);
  });

  it("lists party rounds in history without naming a single opponent", async () => {
    const playedAt = new Date("2026-11-08T12:00:00.000Z");
    const { db } = fakeDb({
      matches: [],
      duel_results: [{
        roundId: "round-1", mode: "party", outcome: "bot", winnerId: null, players: [player.id, "rival"],
        reason: "blast", durationMs: 60_000, createdAt: playedAt
      }],
      player_profiles: []
    });

    const { matches } = await loadPlayerHistory(db, player, 10);

    expect(matches).toEqual([{
      id: "party-round-1", kind: "party", result: "loss", opponentName: "3 rivals",
      durationMs: 60_000, score: null, reason: "blast", playedAt: playedAt.toISOString()
    }]);
  });

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
