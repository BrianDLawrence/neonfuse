import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_STAGES,
  CAMPAIGN_STAGE_IDS,
  EMPTY_CAMPAIGN_PROGRESS,
  applyStageResult,
  deriveCampaignProgress,
  getCampaignStage,
  getNextStage,
  isCampaignStageId,
  isStageUnlocked,
  sanitizeCampaignProgress,
  scoreStageResult,
  type CampaignProgress
} from "./campaign";
import { BOT_PROFILES } from "./bots";

const firstStage = CAMPAIGN_STAGES[0];
const win = { winner: "player" as const, durationMs: 120_000, blocksCleared: 0 };

describe("campaign stage table", () => {
  it("lists every stage id once, in ladder order", () => {
    expect(CAMPAIGN_STAGES.map((stage) => stage.id)).toEqual([...CAMPAIGN_STAGE_IDS]);
  });

  it("runs Act 1 against the four base bots in teaching order", () => {
    expect(CAMPAIGN_STAGES.map((stage) => stage.bots.map((bot) => bot.profileId))).toEqual([
      ["fuse-rush"],
      ["circuit-shade"],
      ["volt-warden"],
      ["glitch-bloom"]
    ]);
  });

  it("only references known bots and knockout objectives", () => {
    for (const stage of CAMPAIGN_STAGES) {
      expect(stage.objective).toBe("knockout");
      expect(stage.roundsToWin).toBeGreaterThanOrEqual(1);
      expect(stage.parTimeMs).toBeGreaterThan(0);
      stage.bots.forEach((bot) => expect(BOT_PROFILES[bot.profileId]).toBeDefined());
    }
  });

  it("recognises known stage ids only", () => {
    expect(isCampaignStageId("1-1")).toBe(true);
    expect(isCampaignStageId("9-9")).toBe(false);
    expect(isCampaignStageId(11)).toBe(false);
    expect(getCampaignStage("nope")).toBeNull();
  });
});

describe("stage unlocks", () => {
  it("opens only the first stage for a new player", () => {
    expect(isStageUnlocked(EMPTY_CAMPAIGN_PROGRESS, "1-1")).toBe(true);
    expect(isStageUnlocked(EMPTY_CAMPAIGN_PROGRESS, "1-2")).toBe(false);
    expect(getNextStage(EMPTY_CAMPAIGN_PROGRESS)?.id).toBe("1-1");
  });

  it("opens the next stage after a clear", () => {
    const progress = applyStageResult(EMPTY_CAMPAIGN_PROGRESS, "1-1", win);

    expect(isStageUnlocked(progress, "1-2")).toBe(true);
    expect(isStageUnlocked(progress, "1-3")).toBe(false);
    expect(getNextStage(progress)?.id).toBe("1-2");
  });

  it("returns no next stage once the ladder is cleared", () => {
    const progress = CAMPAIGN_STAGE_IDS.reduce<CampaignProgress>(
      (current, id) => applyStageResult(current, id, win),
      EMPTY_CAMPAIGN_PROGRESS
    );

    expect(getNextStage(progress)).toBeNull();
  });
});

describe("scoreStageResult", () => {
  it("gives no stars for a loss or a draw", () => {
    expect(scoreStageResult(firstStage, { ...win, winner: "bot", durationMs: 1 })).toBe(0);
    expect(scoreStageResult(firstStage, { ...win, winner: "draw", durationMs: 1 })).toBe(0);
  });

  it("gives one star for a slow clear with few blocks", () => {
    expect(scoreStageResult(firstStage, win)).toBe(1);
  });

  it("adds a star for par time and one for the block target", () => {
    const underPar = { ...win, durationMs: firstStage.parTimeMs };
    const blocks = { ...win, blocksCleared: firstStage.blockTarget };

    expect(scoreStageResult(firstStage, underPar)).toBe(2);
    expect(scoreStageResult(firstStage, blocks)).toBe(2);
    expect(scoreStageResult(firstStage, { ...underPar, blocksCleared: firstStage.blockTarget })).toBe(3);
  });
});

describe("applyStageResult", () => {
  it("ignores losses", () => {
    const progress = applyStageResult(EMPTY_CAMPAIGN_PROGRESS, "1-1", { ...win, winner: "bot" });

    expect(progress).toBe(EMPTY_CAMPAIGN_PROGRESS);
  });

  it("keeps the best stars and the fastest clear across retries", () => {
    const threeStars = { ...win, durationMs: 50_000, blocksCleared: 20 };
    let progress = applyStageResult(EMPTY_CAMPAIGN_PROGRESS, "1-1", threeStars);
    progress = applyStageResult(progress, "1-1", { ...win, durationMs: 40_000 });

    expect(progress.stages["1-1"]).toEqual({ stars: 3, bestTimeMs: 40_000 });
  });

  it("does not mutate the previous progress", () => {
    const before = applyStageResult(EMPTY_CAMPAIGN_PROGRESS, "1-1", win);
    applyStageResult(before, "1-2", win);

    expect(before.stages["1-2"]).toBeUndefined();
  });
});

describe("deriveCampaignProgress", () => {
  it("folds stored rounds oldest first", () => {
    const progress = deriveCampaignProgress([
      { stageId: "1-1", ...win },
      { stageId: "1-2", ...win, durationMs: 30_000 }
    ]);

    expect(progress.stages["1-1"]?.stars).toBe(1);
    expect(progress.stages["1-2"]).toEqual({ stars: 2, bestTimeMs: 30_000 });
  });

  it("ignores rounds for stages that were still locked or are unknown", () => {
    const progress = deriveCampaignProgress([
      { stageId: "1-3", ...win },
      { stageId: "7-7", ...win },
      { stageId: "1-1", ...win }
    ]);

    expect(Object.keys(progress.stages)).toEqual(["1-1"]);
  });
});

describe("sanitizeCampaignProgress", () => {
  it("returns empty progress for junk", () => {
    expect(sanitizeCampaignProgress(null)).toEqual(EMPTY_CAMPAIGN_PROGRESS);
    expect(sanitizeCampaignProgress("1-1")).toEqual(EMPTY_CAMPAIGN_PROGRESS);
    expect(sanitizeCampaignProgress({ stages: 4 })).toEqual(EMPTY_CAMPAIGN_PROGRESS);
  });

  it("keeps valid records and drops invalid or unknown ones", () => {
    expect(
      sanitizeCampaignProgress({
        stages: {
          "1-1": { stars: 2, bestTimeMs: 41_000.4 },
          "1-2": { stars: 5, bestTimeMs: 1 },
          "1-3": { stars: 1, bestTimeMs: -1 },
          "9-9": { stars: 3, bestTimeMs: 1 }
        }
      })
    ).toEqual({ stages: { "1-1": { stars: 2, bestTimeMs: 41_000 } } });
  });
});
