import { ARENA_COLS, ARENA_ROWS } from "./arena";
import { BOT_PROFILES, type BotProfile, type BotProfileId } from "./bots";

// Act 1 (Circuit Ladder) only. Later acts extend these unions and the table;
// see docs/SINGLE_PLAYER.md for the full plan.
export const CAMPAIGN_STAGE_IDS = ["1-1", "1-2", "1-3", "1-4"] as const;

export type CampaignStageId = (typeof CAMPAIGN_STAGE_IDS)[number];

export type ArenaPresetId = "standard";

export type StageBotSpec = {
  profileId: BotProfileId;
};

export type CampaignStage = {
  id: CampaignStageId;
  act: 1;
  title: string;
  brief: string;
  arena: { cols: number; rows: number; preset: ArenaPresetId };
  bots: StageBotSpec[];
  objective: "knockout";
  roundsToWin: number;
  parTimeMs: number;
  blockTarget: number;
};

export type StageStars = 0 | 1 | 2 | 3;

export type CampaignStageRecord = {
  stars: StageStars;
  bestTimeMs: number;
};

export type CampaignProgress = {
  stages: Partial<Record<CampaignStageId, CampaignStageRecord>>;
};

/** The facts a finished round already reports, from the player's side. */
export type RoundFacts = {
  winner: "player" | "bot" | "draw";
  durationMs: number;
  blocksCleared: number;
};

export type CampaignRoundRecord = RoundFacts & {
  stageId: string;
};

const STANDARD_ARENA = { cols: ARENA_COLS, rows: ARENA_ROWS, preset: "standard" } as const;

export const CAMPAIGN_STAGES: readonly CampaignStage[] = [
  {
    id: "1-1",
    act: 1,
    title: "First Fuse",
    brief: "Fuse Rush charges straight at you. Let it overcommit, then box it in.",
    arena: STANDARD_ARENA,
    bots: [{ profileId: "fuse-rush" }],
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 60_000,
    blockTarget: 8
  },
  {
    id: "1-2",
    act: 1,
    title: "Power Grab",
    brief: "Circuit Shade races for every powerup. Take them first or it outscales you.",
    arena: STANDARD_ARENA,
    bots: [{ profileId: "circuit-shade" }],
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 75_000,
    blockTarget: 10
  },
  {
    id: "1-3",
    act: 1,
    title: "Pocket Trap",
    brief: "Volt Warden waits in the soft blocks. Always keep a second way out.",
    arena: STANDARD_ARENA,
    bots: [{ profileId: "volt-warden" }],
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 90_000,
    blockTarget: 12
  },
  {
    id: "1-4",
    act: 1,
    title: "Static Bloom",
    brief: "Glitch Bloom never takes the same route twice. Read the danger tiles, not the bot.",
    arena: STANDARD_ARENA,
    bots: [{ profileId: "glitch-bloom" }],
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 90_000,
    blockTarget: 14
  }
];

export const EMPTY_CAMPAIGN_PROGRESS: CampaignProgress = { stages: {} };

export function isCampaignStageId(value: unknown): value is CampaignStageId {
  return typeof value === "string" && (CAMPAIGN_STAGE_IDS as readonly string[]).includes(value);
}

export function getCampaignStage(id: string | null | undefined): CampaignStage | null {
  return CAMPAIGN_STAGES.find((stage) => stage.id === id) ?? null;
}

export function getStageOpponents(stage: CampaignStage): BotProfile[] {
  return stage.bots.map((bot) => BOT_PROFILES[bot.profileId]);
}

/** The stage that must be cleared before `id` opens, or null for the first stage. */
export function getPreviousStage(id: CampaignStageId): CampaignStage | null {
  const index = CAMPAIGN_STAGES.findIndex((stage) => stage.id === id);
  return index > 0 ? CAMPAIGN_STAGES[index - 1] : null;
}

export function isStageCleared(progress: CampaignProgress, id: CampaignStageId): boolean {
  return (progress.stages[id]?.stars ?? 0) >= 1;
}

export function isStageUnlocked(progress: CampaignProgress, id: CampaignStageId): boolean {
  if (!getCampaignStage(id)) {
    return false;
  }

  const previous = getPreviousStage(id);
  return previous === null || isStageCleared(progress, previous.id);
}

/** The first unlocked stage not yet cleared, or null once the ladder is done. */
export function getNextStage(progress: CampaignProgress): CampaignStage | null {
  return (
    CAMPAIGN_STAGES.find(
      (stage) => isStageUnlocked(progress, stage.id) && !isStageCleared(progress, stage.id)
    ) ?? null
  );
}

/** One star for the clear, one for beating par, one for reaching the block target. */
export function scoreStageResult(stage: CampaignStage, result: RoundFacts): StageStars {
  if (result.winner !== "player") {
    return 0;
  }

  const underPar = result.durationMs <= stage.parTimeMs ? 1 : 0;
  const blockGoal = result.blocksCleared >= stage.blockTarget ? 1 : 0;
  return (1 + underPar + blockGoal) as StageStars;
}

/** Folds one round into progress, keeping the best stars and fastest clear. */
export function applyStageResult(
  progress: CampaignProgress,
  id: CampaignStageId,
  result: RoundFacts
): CampaignProgress {
  const stage = getCampaignStage(id);

  if (!stage) {
    return progress;
  }

  const stars = scoreStageResult(stage, result);

  if (stars === 0) {
    return progress;
  }

  const previous = progress.stages[id];
  const record: CampaignStageRecord = previous
    ? {
        stars: Math.max(previous.stars, stars) as StageStars,
        bestTimeMs: Math.min(previous.bestTimeMs, result.durationMs)
      }
    : { stars, bestTimeMs: result.durationMs };

  return { stages: { ...progress.stages, [id]: record } };
}

/**
 * Derives progress from stored rounds, oldest first. A round for a stage that was
 * still locked at that point (or for an unknown stage) is ignored, so the result
 * never depends on trusting the order a client submitted rounds in.
 */
export function deriveCampaignProgress(roundsOldestFirst: CampaignRoundRecord[]): CampaignProgress {
  return roundsOldestFirst.reduce<CampaignProgress>((progress, round) => {
    if (!isCampaignStageId(round.stageId) || !isStageUnlocked(progress, round.stageId)) {
      return progress;
    }

    return applyStageResult(progress, round.stageId, round);
  }, EMPTY_CAMPAIGN_PROGRESS);
}

/** Rebuilds progress from untrusted stored data (e.g. browser storage), dropping anything invalid. */
export function sanitizeCampaignProgress(value: unknown): CampaignProgress {
  if (typeof value !== "object" || value === null) {
    return EMPTY_CAMPAIGN_PROGRESS;
  }

  const stages = (value as { stages?: unknown }).stages;

  if (typeof stages !== "object" || stages === null) {
    return EMPTY_CAMPAIGN_PROGRESS;
  }

  const clean: CampaignProgress["stages"] = {};

  for (const id of CAMPAIGN_STAGE_IDS) {
    const record = (stages as Record<string, unknown>)[id];

    if (typeof record !== "object" || record === null) {
      continue;
    }

    const { stars, bestTimeMs } = record as { stars?: unknown; bestTimeMs?: unknown };

    if (
      (stars === 1 || stars === 2 || stars === 3) &&
      typeof bestTimeMs === "number" &&
      Number.isFinite(bestTimeMs) &&
      bestTimeMs >= 0
    ) {
      clean[id] = { stars, bestTimeMs: Math.round(bestTimeMs) };
    }
  }

  return { stages: clean };
}
