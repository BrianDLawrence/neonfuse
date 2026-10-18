import { ARENA_COLS, ARENA_ROWS, type ArenaSpec } from "./arena";
import {
  BOT_PROFILES,
  type BotProfile,
  type BotProfileId,
  type BotTraitSet
} from "./bots";
import {
  MAX_LOADOUT,
  createInitialLoadout,
  type ActorLoadout,
  type PlayerLoadout,
  type PowerupDropRates
} from "./powerups";

// Acts 1 (Circuit Ladder) and 2 (Overclock). Act 3 extends these unions and the
// table; see docs/SINGLE_PLAYER.md for the full plan.
export const CAMPAIGN_STAGE_IDS = ["1-1", "1-2", "1-3", "1-4", "2-1", "2-2", "2-3", "2-4", "2-5"] as const;

export type CampaignStageId = (typeof CAMPAIGN_STAGE_IDS)[number];

export type CampaignActId = 1 | 2;

export const CAMPAIGN_ACTS: readonly { id: CampaignActId; title: string }[] = [
  { id: 1, title: "Circuit Ladder" },
  { id: 2, title: "Overclock" }
];

/**
 * How a stage tunes a base bot. Every value is a bounded number applied to a
 * known profile, then clamped by resolveStageBot, the same rule ARCHITECTURE.md
 * sets for future LLM persona patches.
 */
export type StageBotSpec = {
  profileId: BotProfileId;
  traitDelta?: Partial<BotTraitSet>;
  startingLoadout?: Partial<PlayerLoadout>;
};

export type StageModifiers = {
  /** Fuse on bot bombs, bounded 1200–2400ms (default 1800). */
  botFuseMs?: number;
  /** Multiplies the bot move delay, bounded 0.7–1.3 (lower is faster). */
  botMoveScale?: number;
  /** Replaces the drop rates for this stage, each 1–10. */
  powerupDropRates?: PowerupDropRates;
};

export type CampaignStage = {
  id: CampaignStageId;
  act: CampaignActId;
  title: string;
  brief: string;
  arena: ArenaSpec;
  /** One or two bots; a second bot makes the stage a gauntlet. */
  bots: StageBotSpec[];
  modifiers: StageModifiers;
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

const STANDARD_ARENA: ArenaSpec = { cols: ARENA_COLS, rows: ARENA_ROWS, preset: "standard" };

export const DEFAULT_BOT_FUSE_MS = 1800;
export const BOT_FUSE_BOUNDS = { min: 1200, max: 2400 } as const;
export const BOT_MOVE_SCALE_BOUNDS = { min: 0.7, max: 1.3 } as const;

export const CAMPAIGN_STAGES: readonly CampaignStage[] = [
  {
    id: "1-1",
    act: 1,
    title: "First Fuse",
    brief: "Fuse Rush charges straight at you. Let it overcommit, then box it in.",
    arena: STANDARD_ARENA,
    bots: [{ profileId: "fuse-rush" }],
    modifiers: {},
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
    modifiers: {},
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
    modifiers: {},
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
    modifiers: {},
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 90_000,
    blockTarget: 14
  },
  {
    id: "2-1",
    act: 2,
    title: "Overclocked",
    brief: "Fuse Rush starts with two bombs and a short fuse. Stay out of its lanes until it runs dry.",
    arena: STANDARD_ARENA,
    bots: [{ profileId: "fuse-rush", traitDelta: { aggression: 1 }, startingLoadout: { bombs: 2 } }],
    modifiers: { botFuseMs: 1500, botMoveScale: 0.9 },
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 75_000,
    blockTarget: 10
  },
  {
    id: "2-2",
    act: 2,
    title: "Open Core",
    brief: "The centre is bare and walled by blocks. Circuit Shade will try to own it. Break in from the side.",
    arena: { ...STANDARD_ARENA, preset: "open-core" },
    bots: [{ profileId: "circuit-shade" }],
    modifiers: {},
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 80_000,
    blockTarget: 14
  },
  {
    id: "2-3",
    act: 2,
    title: "Maze",
    brief: "Blocks everywhere and Volt Warden knows it. Every bomb you plant opens a lane for both of you.",
    arena: { ...STANDARD_ARENA, preset: "maze" },
    bots: [{ profileId: "volt-warden" }],
    modifiers: {},
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 105_000,
    blockTarget: 20
  },
  {
    id: "2-4",
    act: 2,
    title: "Bloom Overclocked",
    brief: "Speed drops everywhere and Glitch Bloom starts hot. Grab the boots before it does.",
    arena: STANDARD_ARENA,
    bots: [
      {
        profileId: "glitch-bloom",
        traitDelta: { riskTolerance: -1, powerupGreed: 1 },
        startingLoadout: { bombs: 2, blast: 3 }
      }
    ],
    modifiers: {
      botFuseMs: 1600,
      botMoveScale: 0.9,
      powerupDropRates: { bomb: 3, blast: 3, speed: 8 }
    },
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 90_000,
    blockTarget: 14
  },
  {
    id: "2-5",
    act: 2,
    title: "Gauntlet",
    brief: "Fuse Rush and Circuit Shade at once. They don't team up, but they both want you.",
    arena: STANDARD_ARENA,
    bots: [{ profileId: "fuse-rush" }, { profileId: "circuit-shade" }],
    modifiers: {},
    objective: "knockout",
    roundsToWin: 1,
    parTimeMs: 120_000,
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

export function getActStages(act: CampaignActId): CampaignStage[] {
  return CAMPAIGN_STAGES.filter((stage) => stage.act === act);
}

/** An act opens when its first stage does, i.e. once the previous act is cleared. */
export function isActUnlocked(progress: CampaignProgress, act: CampaignActId): boolean {
  const first = getActStages(act)[0];
  return first ? isStageUnlocked(progress, first.id) : false;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Builds the bot a stage fields: the base profile with its trait deltas applied
 * and clamped to 0–10, and a starting loadout clamped between the default
 * loadout and MAX_LOADOUT. The base profile is never mutated.
 */
export function resolveStageBot(spec: StageBotSpec): { profile: BotProfile; loadout: ActorLoadout } {
  const base = BOT_PROFILES[spec.profileId];
  const traits = { ...base.traits };

  for (const key of Object.keys(traits) as (keyof BotTraitSet)[]) {
    const delta = spec.traitDelta?.[key] ?? 0;
    traits[key] = clamp(Math.round(base.traits[key] + delta), 0, 10);
  }

  const initial = createInitialLoadout();
  const loadout = { ...initial };

  for (const key of Object.keys(loadout) as (keyof PlayerLoadout)[]) {
    const requested = spec.startingLoadout?.[key] ?? initial[key];
    loadout[key] = clamp(Math.round(requested), initial[key], MAX_LOADOUT[key]);
  }

  return { profile: { ...base, traits }, loadout };
}

/** The stage's rule modifiers with defaults filled in and every value clamped to its bounds. */
export function resolveStageModifiers(stage: CampaignStage): {
  botFuseMs: number;
  botMoveScale: number;
  powerupDropRates: PowerupDropRates | null;
} {
  const { botFuseMs, botMoveScale, powerupDropRates } = stage.modifiers;

  return {
    botFuseMs: Math.round(clamp(botFuseMs ?? DEFAULT_BOT_FUSE_MS, BOT_FUSE_BOUNDS.min, BOT_FUSE_BOUNDS.max)),
    botMoveScale: clamp(botMoveScale ?? 1, BOT_MOVE_SCALE_BOUNDS.min, BOT_MOVE_SCALE_BOUNDS.max),
    powerupDropRates: powerupDropRates
      ? {
          bomb: clamp(Math.round(powerupDropRates.bomb), 1, 10),
          blast: clamp(Math.round(powerupDropRates.blast), 1, 10),
          speed: clamp(Math.round(powerupDropRates.speed), 1, 10)
        }
      : null
  };
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
