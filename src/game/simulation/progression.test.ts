import { describe, expect, it } from "vitest";
import {
  MAX_PLAYER_LEVEL,
  calculatePlayerProgression,
  getLevelProgress
} from "./progression";

const EMPTY_CAREER = {
  local: { played: 0, wins: 0, losses: 0, draws: 0 },
  duel: { played: 0, wins: 0, losses: 0, draws: 0 },
  bestScore: 0,
  bestWinStreak: 0
};

describe("calculatePlayerProgression", () => {
  it("starts a new player at level one with the default title", () => {
    expect(calculatePlayerProgression(EMPTY_CAREER)).toEqual({
      xp: 0,
      level: 1,
      badges: [],
      unlockedTitles: ["fuse-initiate"],
      equippedTitle: "fuse-initiate"
    });
  });

  it("weights verified duel results more heavily than local results", () => {
    const localWin = calculatePlayerProgression({
      ...EMPTY_CAREER,
      local: { played: 1, wins: 1, losses: 0, draws: 0 }
    });
    const duelWin = calculatePlayerProgression({
      ...EMPTY_CAREER,
      duel: { played: 1, wins: 1, losses: 0, draws: 0 }
    });

    expect(localWin.xp).toBe(50);
    expect(duelWin.xp).toBe(150);
  });

  it("unlocks achievements and their titles from career milestones", () => {
    const progression = calculatePlayerProgression({
      local: { played: 20, wins: 2, losses: 17, draws: 1 },
      duel: { played: 5, wins: 3, losses: 2, draws: 0 },
      bestScore: 8_100,
      bestWinStreak: 3
    });

    expect(progression.badges).toEqual([
      "first-spark",
      "arena-breaker",
      "duel-certified",
      "three-alarm",
      "score-surge",
      "arena-regular"
    ]);
    expect(progression.unlockedTitles).toEqual([
      "fuse-initiate",
      "arena-breaker",
      "duel-certified",
      "hot-streak",
      "high-voltage",
      "grid-veteran"
    ]);
  });

  it("keeps a requested title equipped only while it is unlocked", () => {
    const eligibleCareer = {
      ...EMPTY_CAREER,
      duel: { played: 1, wins: 1, losses: 0, draws: 0 }
    };

    expect(calculatePlayerProgression(eligibleCareer, "duel-certified").equippedTitle).toBe(
      "duel-certified"
    );
    expect(calculatePlayerProgression(EMPTY_CAREER, "duel-certified").equippedTitle).toBe(
      "fuse-initiate"
    );
  });

  it("uses a bounded, predictable level curve", () => {
    const progression = calculatePlayerProgression({
      local: { played: 100_000, wins: 100_000, losses: 0, draws: 0 },
      duel: { played: 100_000, wins: 100_000, losses: 0, draws: 0 },
      bestScore: 100_000,
      bestWinStreak: 100_000
    });

    expect(progression.level).toBe(MAX_PLAYER_LEVEL);
    expect(getLevelProgress(0)).toEqual({ current: 0, required: 500, percent: 0 });
    expect(getLevelProgress(650)).toEqual({ current: 150, required: 500, percent: 30 });
    expect(getLevelProgress(progression.xp)).toEqual({ current: 500, required: 500, percent: 100 });
  });
});
