import { describe, expect, it } from "vitest";
import { toHighScoreEntry } from "./leaderboard";

const storedScore = {
  matchId: "match-1",
  visitorId: "visitor-1",
  score: 4200,
  mode: "player-vs-bot",
  winner: "player",
  durationMs: 30_000,
  blocksCleared: 8,
  createdAt: new Date("2026-09-11T10:00:00.000Z")
};

describe("toHighScoreEntry", () => {
  it("uses the authenticated player name for new leaderboard rows", () => {
    const entry = toHighScoreEntry({ ...storedScore, playerName: "NeonPilot" }, 0);

    expect(entry.playerName).toBe("NeonPilot");
    expect(entry.rank).toBe(1);
  });

  it("keeps historical initials readable", () => {
    const entry = toHighScoreEntry({ ...storedScore, initials: "NFX" }, 3);

    expect(entry.playerName).toBe("NFX");
    expect(entry.rank).toBe(4);
  });
});
