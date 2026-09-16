import { describe, expect, it } from "vitest";
import { summarizePlayerCareer } from "./player-career";

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
