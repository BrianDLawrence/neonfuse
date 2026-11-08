import { describe, expect, it } from "vitest";
import {
  EMPTY_CAMPAIGN_PROGRESS,
  getActStages,
  type CampaignActId,
  type CampaignProgress
} from "./campaign";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  MAX_PLAYER_LEVEL,
  PLAYER_TITLE_IDS,
  calculatePlayerProgression,
  getLevelProgress,
  isActCleared
} from "./progression";

const EMPTY_CAREER = {
  local: { played: 0, wins: 0, losses: 0, draws: 0 },
  duel: { played: 0, wins: 0, losses: 0, draws: 0 },
  bestScore: 0,
  bestWinStreak: 0
};

function clearActs(acts: CampaignActId[], skip: string[] = []): CampaignProgress {
  const stages: CampaignProgress["stages"] = {};

  for (const act of acts) {
    for (const stage of getActStages(act)) {
      if (!skip.includes(stage.id)) {
        stages[stage.id] = { stars: 1, bestTimeMs: 60_000 };
      }
    }
  }

  return { stages };
}

const CAMPAIGN_ACHIEVEMENTS = ["ladder-climber", "overclocked", "megagrid"] as const;

describe("calculatePlayerProgression", () => {
  it("awards Party Brawl XP for rounds, round wins and series wins without duel badges", () => {
    const party = calculatePlayerProgression({
      ...EMPTY_CAREER,
      party: { played: 3, wins: 2, losses: 1, draws: 0 },
      partySeriesWins: 1
    });

    expect(party.xp).toBe(3 * 30 + 2 * 60 + 100);
    expect(party.badges).toEqual(["first-spark"]);
    expect(calculatePlayerProgression(EMPTY_CAREER).xp).toBe(0);
  });

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

  it("only awards act-clear achievements from campaign progress", () => {
    const progression = calculatePlayerProgression(EMPTY_CAREER, null, EMPTY_CAMPAIGN_PROGRESS);

    expect(progression.badges).toEqual([]);
    expect(progression.unlockedTitles).toEqual(["fuse-initiate"]);
  });

  it("does not award an act that is only partially cleared", () => {
    const progression = calculatePlayerProgression(
      EMPTY_CAREER,
      "ladder-climber",
      clearActs([1], [getActStages(1)[0].id])
    );

    expect(progression.badges).not.toContain("ladder-climber");
    expect(progression.unlockedTitles).not.toContain("ladder-climber");
    expect(progression.equippedTitle).toBe("fuse-initiate");
  });

  it("does not award an act when only its last stage is cleared", () => {
    const stages = getActStages(2);
    const last = stages[stages.length - 1];
    const progress: CampaignProgress = { stages: { [last.id]: { stars: 3, bestTimeMs: 1_000 } } };

    expect(isActCleared(progress, 2)).toBe(false);
    expect(calculatePlayerProgression(EMPTY_CAREER, null, progress).badges).toEqual([]);
  });

  it.each([
    [1, "ladder-climber", "Ladder Climber"],
    [2, "overclocked", "Overclocked"],
    [3, "megagrid", "Megagrid"]
  ] as const)("awards act %i when every stage is cleared", (act, id, name) => {
    const progression = calculatePlayerProgression(EMPTY_CAREER, id, clearActs([act]));

    expect(progression.badges).toEqual([id]);
    expect(progression.unlockedTitles).toEqual(["fuse-initiate", id]);
    expect(progression.equippedTitle).toBe(id);
    expect(ACHIEVEMENTS[id]).toMatchObject({ name, titleId: id });
  });

  it("awards all three act achievements after a full campaign clear", () => {
    const progression = calculatePlayerProgression(
      EMPTY_CAREER,
      "megagrid",
      clearActs([1, 2, 3])
    );

    expect(progression.badges).toEqual([...CAMPAIGN_ACHIEVEMENTS]);
    expect(progression.unlockedTitles).toEqual(["fuse-initiate", ...CAMPAIGN_ACHIEVEMENTS]);
    expect(progression.equippedTitle).toBe("megagrid");
  });

  it("keeps career achievements independent of campaign progress", () => {
    const career = {
      local: { played: 1, wins: 1, losses: 0, draws: 0 },
      duel: { played: 0, wins: 0, losses: 0, draws: 0 },
      bestScore: 0,
      bestWinStreak: 0
    };
    const withoutCampaign = calculatePlayerProgression(career);
    const withCampaign = calculatePlayerProgression(career, null, clearActs([1, 2, 3]));

    expect(withoutCampaign.badges).toEqual(["first-spark", "arena-breaker"]);
    expect(withCampaign.badges).toEqual(["first-spark", "arena-breaker", ...CAMPAIGN_ACHIEVEMENTS]);
    expect(withCampaign.xp).toBe(withoutCampaign.xp);
  });

  it("refuses an act title the player has not earned", () => {
    expect(calculatePlayerProgression(EMPTY_CAREER, "megagrid").equippedTitle).toBe("fuse-initiate");
    expect(
      calculatePlayerProgression(EMPTY_CAREER, "megagrid", clearActs([1, 2])).equippedTitle
    ).toBe("fuse-initiate");
  });

  it("keeps every achievement title registered", () => {
    for (const id of ACHIEVEMENT_IDS) {
      const titleId = ACHIEVEMENTS[id].titleId;
      expect(titleId === null || PLAYER_TITLE_IDS.includes(titleId)).toBe(true);
    }
  });
});
