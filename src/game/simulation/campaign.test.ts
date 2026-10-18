import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_ACTS,
  CAMPAIGN_STAGES,
  CAMPAIGN_STAGE_IDS,
  DEFAULT_BOT_FUSE_MS,
  EMPTY_CAMPAIGN_PROGRESS,
  applyStageResult,
  deriveCampaignProgress,
  getActStages,
  getCampaignStage,
  getNextStage,
  isActUnlocked,
  isCampaignStageId,
  isStageUnlocked,
  resolveStageBot,
  resolveStageModifiers,
  sanitizeCampaignProgress,
  scoreStageResult,
  type CampaignProgress,
  type CampaignStage,
  type CampaignStageId
} from "./campaign";
import { createArena, getSpawnPoints, isValidArenaSize } from "./arena";
import { BOT_PROFILES, chooseBotTurn } from "./bots";
import { MAX_LOADOUT, createInitialLoadout } from "./powerups";

function clearThrough(lastId: CampaignStageId): CampaignProgress {
  const ids = CAMPAIGN_STAGE_IDS.slice(0, CAMPAIGN_STAGE_IDS.indexOf(lastId) + 1);
  return ids.reduce<CampaignProgress>(
    (current, id) => applyStageResult(current, id, { winner: "player", durationMs: 120_000, blocksCleared: 0 }),
    EMPTY_CAMPAIGN_PROGRESS
  );
}

const firstStage = CAMPAIGN_STAGES[0];
const win = { winner: "player" as const, durationMs: 120_000, blocksCleared: 0 };

describe("campaign stage table", () => {
  it("lists every stage id once, in ladder order", () => {
    expect(CAMPAIGN_STAGES.map((stage) => stage.id)).toEqual([...CAMPAIGN_STAGE_IDS]);
  });

  it("runs Act 1 against the four base bots in teaching order", () => {
    expect(getActStages(1).map((stage) => stage.bots.map((bot) => bot.profileId))).toEqual([
      ["fuse-rush"],
      ["circuit-shade"],
      ["volt-warden"],
      ["glitch-bloom"]
    ]);
  });

  it("orders stages by act and gives every act at least one stage", () => {
    const acts = CAMPAIGN_STAGES.map((stage) => stage.act);

    expect(acts).toEqual([...acts].sort());
    CAMPAIGN_ACTS.forEach((act) => expect(getActStages(act.id).length).toBeGreaterThan(0));
  });

  it("ends Act 2 with a two-bot gauntlet and keeps every other stage 1v1", () => {
    const gauntlets = CAMPAIGN_STAGES.filter((stage) => stage.bots.length > 1).map((stage) => stage.id);

    expect(gauntlets).toEqual(["2-5"]);
    expect(getCampaignStage("2-5")?.bots.map((bot) => bot.profileId)).toEqual(["fuse-rush", "circuit-shade"]);
  });

  it("only references known bots, valid boards, in-bound modifiers and knockout objectives", () => {
    for (const stage of CAMPAIGN_STAGES) {
      const modifiers = resolveStageModifiers(stage);

      expect(isValidArenaSize(stage.arena.cols, stage.arena.rows)).toBe(true);
      expect(stage.bots.length).toBeGreaterThanOrEqual(1);
      expect(stage.bots.length).toBeLessThanOrEqual(2);
      expect(modifiers.botFuseMs).toBe(stage.modifiers.botFuseMs ?? DEFAULT_BOT_FUSE_MS);
      expect(modifiers.botMoveScale).toBe(stage.modifiers.botMoveScale ?? 1);
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

  it("opens Act 2 only after the last Act 1 stage is cleared", () => {
    expect(isActUnlocked(EMPTY_CAMPAIGN_PROGRESS, 1)).toBe(true);
    expect(isActUnlocked(clearThrough("1-3"), 2)).toBe(false);
    expect(isActUnlocked(clearThrough("1-4"), 2)).toBe(true);
    expect(getNextStage(clearThrough("1-4"))?.id).toBe("2-1");
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

describe("resolveStageBot", () => {
  it("returns the base profile and default loadout when the spec has no tuning", () => {
    const { profile, loadout } = resolveStageBot({ profileId: "volt-warden" });

    expect(profile).toEqual(BOT_PROFILES["volt-warden"]);
    expect(loadout).toEqual(createInitialLoadout());
  });

  it("applies trait deltas and clamps them to 0-10", () => {
    const { profile } = resolveStageBot({
      profileId: "fuse-rush",
      traitDelta: { aggression: 5, patience: -9, riskTolerance: 0.4 }
    });

    expect(profile.traits.aggression).toBe(10);
    expect(profile.traits.patience).toBe(0);
    expect(profile.traits.riskTolerance).toBe(BOT_PROFILES["fuse-rush"].traits.riskTolerance);
  });

  it("clamps the starting loadout between the default loadout and MAX_LOADOUT", () => {
    const { loadout } = resolveStageBot({
      profileId: "fuse-rush",
      startingLoadout: { bombs: 99, blast: 0, speed: 2 }
    });

    expect(loadout).toEqual({ bombs: MAX_LOADOUT.bombs, blast: createInitialLoadout().blast, speed: 2 });
  });

  it("never mutates the shared base profile", () => {
    const before = structuredClone(BOT_PROFILES["glitch-bloom"]);
    resolveStageBot({ profileId: "glitch-bloom", traitDelta: { aggression: 3 } });

    expect(BOT_PROFILES["glitch-bloom"]).toEqual(before);
  });

  it("gives the Overclocked stages a stronger opening loadout", () => {
    const overclocked = getCampaignStage("2-1") as CampaignStage;

    expect(resolveStageBot(overclocked.bots[0]).loadout.bombs).toBe(2);
  });
});

describe("resolveStageModifiers", () => {
  const base = getCampaignStage("1-1") as CampaignStage;

  it("fills in today's defaults for an unmodified stage", () => {
    expect(resolveStageModifiers(base)).toEqual({
      botFuseMs: DEFAULT_BOT_FUSE_MS,
      botMoveScale: 1,
      powerupDropRates: null
    });
  });

  it("clamps out-of-range values to their bounds", () => {
    const wild = {
      ...base,
      modifiers: { botFuseMs: 100, botMoveScale: 9, powerupDropRates: { bomb: 0, blast: 4.6, speed: 40 } }
    };

    expect(resolveStageModifiers(wild)).toEqual({
      botFuseMs: 1200,
      botMoveScale: 1.3,
      powerupDropRates: { bomb: 1, blast: 5, speed: 10 }
    });
  });
});

describe("stage boards", () => {
  // ArenaScene still renders a fixed 13x11 board; Phase 3 (Megagrid) lifts this.
  it("keeps every stage on the standard 13x11 board until rendering supports other sizes", () => {
    CAMPAIGN_STAGES.forEach((stage) => expect([stage.arena.cols, stage.arena.rows]).toEqual([13, 11]));
  });
});

describe("Act 2 boards", () => {
  it.each(getActStages(2).map((stage) => [stage.id, stage] as const))(
    "lets the stage %s bots act from their spawn instead of waiting forever",
    (_id, stage) => {
      const arena = createArena(stage.arena);
      const spawns = getSpawnPoints(arena);

      stage.bots.forEach((spec, index) => {
        const { profile, loadout } = resolveStageBot(spec);
        const intents = Array.from({ length: 24 }, (_, turn) =>
          chooseBotTurn({
            arena,
            actor: { id: index === 0 ? "bot-a" : "bot-b", tile: spawns[index + 1], alive: true, loadout, profile, turn },
            opponentTile: spawns[0],
            bombs: [],
            activeBombCount: 0,
            decisionSeed: turn * 101
          })
        );

        expect(intents.some((intent) => intent.type !== "wait")).toBe(true);
      });
    }
  );
});
