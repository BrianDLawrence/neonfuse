import type { ArenaPresetId, ArenaSpec } from "./arena";
import { BOT_PROFILE_ORDER, BOT_PROFILES, type BotProfile, type BotTraitSet } from "./bots";
import {
  clampModifiers,
  type ResolvedModifiers,
  type StageBotSpec,
  type StageModifiers
} from "./campaign";

// Daily Fuse: one seeded challenge per UTC day; see docs/SINGLE_PLAYER.md. Every
// function here takes the date key as input, so nothing reads the clock.

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** The server accepts today's UTC date plus or minus this many days. */
export const DAILY_WINDOW_DAYS = 1;

/** How many recent cleared days progress keeps, enough to cover the window. */
const RECENT_DAYS = 3;

export type DailyModifierId =
  | "short-fuse"
  | "swift-circuits"
  | "speed-rain"
  | "bomb-rain"
  | "slow-circuits"
  | "wide-blast"
  | "overclocked"
  | "jackpot";

export type DailyModifier = {
  id: DailyModifierId;
  label: string;
  blurb: string;
  /** The same bounded values stage data uses, run through clampModifiers. */
  modifiers: StageModifiers;
};

export type DailyChallenge = {
  dateKey: string;
  seed: number;
  arena: ArenaSpec;
  /** Passed to createArena, which shifts the soft-block pattern with it. */
  arenaSeed: number;
  /** One or two bots; a second bot makes the day a gauntlet. */
  bots: StageBotSpec[];
  modifier: DailyModifier;
};

export type DailyWin = {
  dateKey: string;
  durationMs: number;
};

export type DailyProgress = {
  /** Distinct days cleared; replaying a day does not add to it. */
  totalClears: number;
  longestStreak: number;
  /** Consecutive cleared days ending at lastClearedKey. */
  runLength: number;
  lastClearedKey: string | null;
  bestTimeMs: number | null;
  /** Fastest clear for the most recent cleared days, keyed by date. */
  recent: Record<string, number>;
};

// Bot fuses stay at 1500ms or more: bots flee any bomb rather than timing fuses.
// Lower move scale means faster bots.
export const DAILY_MODIFIERS: readonly DailyModifier[] = [
  { id: "short-fuse", label: "Short Fuse", blurb: "Bot bombs blow in a second and a half.", modifiers: { botFuseMs: 1500 } },
  { id: "swift-circuits", label: "Swift Circuits", blurb: "Bots move a quarter faster.", modifiers: { botMoveScale: 0.8 } },
  {
    id: "speed-rain",
    label: "Speed Rain",
    blurb: "Blocks mostly drop speed boots.",
    modifiers: { powerupDropRates: { bomb: 3, blast: 3, speed: 8 } }
  },
  {
    id: "bomb-rain",
    label: "Bomb Rain",
    blurb: "Blocks mostly drop extra bombs.",
    modifiers: { powerupDropRates: { bomb: 8, blast: 3, speed: 3 } }
  },
  { id: "slow-circuits", label: "Slow Circuits", blurb: "Bots move a fifth slower. Go for a fast clear.", modifiers: { botMoveScale: 1.25 } },
  {
    id: "wide-blast",
    label: "Wide Blast",
    blurb: "Blocks mostly drop blast range.",
    modifiers: { powerupDropRates: { bomb: 3, blast: 8, speed: 3 } }
  },
  {
    id: "overclocked",
    label: "Overclocked",
    blurb: "Shorter bot fuses and quicker bots.",
    modifiers: { botFuseMs: 1600, botMoveScale: 0.9 }
  },
  {
    id: "jackpot",
    label: "Jackpot",
    blurb: "Every powerup drops more often.",
    modifiers: { powerupDropRates: { bomb: 7, blast: 7, speed: 7 } }
  }
];

/**
 * Board sizes, weighted toward boards that keep the fit-to-screen camera on
 * phones and laptops (up to 13 columns and 13 rows). The three larger boards are
 * occasional Megagrid days where phones follow the player.
 */
export const DAILY_BOARDS: readonly { cols: number; rows: number; weight: number }[] = [
  { cols: 13, rows: 11, weight: 4 },
  { cols: 11, rows: 9, weight: 2 },
  { cols: 11, rows: 11, weight: 2 },
  { cols: 13, rows: 9, weight: 1 },
  { cols: 11, rows: 13, weight: 1 },
  { cols: 13, rows: 13, weight: 2 },
  { cols: 15, rows: 13, weight: 1 },
  { cols: 17, rows: 13, weight: 1 },
  { cols: 19, rows: 15, weight: 1 }
];

const DAILY_PRESETS: readonly { preset: ArenaPresetId; weight: number }[] = [
  { preset: "standard", weight: 3 },
  { preset: "open-core", weight: 2 },
  { preset: "maze", weight: 1 }
];

/** Gauntlet days need at least a standard board's worth of room. */
const GAUNTLET_MIN_CELLS = 13 * 11;
const GAUNTLET_CHANCE = 0.25;
const HOT_START_CHANCE = 0.3;
const ARENA_SEED_VARIANTS = 5;

export const EMPTY_DAILY_PROGRESS: DailyProgress = {
  totalClears: 0,
  longestStreak: 0,
  runLength: 0,
  lastClearedKey: null,
  bestTimeMs: null,
  recent: {}
};

/** A real calendar date written as YYYY-MM-DD. */
export function isDailyDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  return utcDateKey(new Date(Date.UTC(year, month - 1, day))) === value;
}

/** The UTC calendar day of a moment, which is the Daily Fuse day. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function shiftDateKey(dateKey: string, days: number): string {
  return utcDateKey(new Date((dayNumber(dateKey) + days) * DAY_MS));
}

/**
 * True when the key is within DAILY_WINDOW_DAYS of the UTC day containing
 * nowMs. One day either side tolerates players whose local date differs from UTC.
 */
export function isDailyKeyInWindow(dateKey: string, nowMs: number): boolean {
  return (
    isDailyDateKey(dateKey) &&
    Number.isFinite(nowMs) &&
    Math.abs(dayNumber(dateKey) - Math.floor(nowMs / DAY_MS)) <= DAILY_WINDOW_DAYS
  );
}

// FNV-1a over the key, so each date gets a stable 32-bit seed.
function hashDateKey(dateKey: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < dateKey.length; index += 1) {
    hash ^= dateKey.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

// mulberry32: a small seeded stream of draws in [0, 1).
function createDraws(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickWeighted<T extends { weight: number }>(entries: readonly T[], draw: number): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let remaining = draw * total;

  for (const entry of entries) {
    remaining -= entry.weight;

    if (remaining < 0) {
      return entry;
    }
  }

  return entries[entries.length - 1];
}

function pickIndex(length: number, draw: number): number {
  return Math.min(length - 1, Math.floor(draw * length));
}

/**
 * Builds the day's challenge from a date key, or null for a malformed key.
 * The modifier rotates by day so it changes every day; board, layout and bots
 * come from a seeded hash of the date.
 */
export function getDailyChallenge(dateKey: string | null | undefined): DailyChallenge | null {
  if (!isDailyDateKey(dateKey)) {
    return null;
  }

  const seed = hashDateKey(dateKey);
  const draw = createDraws(seed);
  const day = dayNumber(dateKey);
  const modifier = DAILY_MODIFIERS[((day % DAILY_MODIFIERS.length) + DAILY_MODIFIERS.length) % DAILY_MODIFIERS.length];
  const board = pickWeighted(DAILY_BOARDS, draw());
  const { preset } = pickWeighted(DAILY_PRESETS, draw());
  const arenaSeed = pickIndex(ARENA_SEED_VARIANTS, draw());
  const gauntlet = board.cols * board.rows >= GAUNTLET_MIN_CELLS && draw() < GAUNTLET_CHANCE;
  const roster = [...BOT_PROFILE_ORDER];
  const bots: StageBotSpec[] = [];

  for (let slot = 0; slot < (gauntlet ? 2 : 1); slot += 1) {
    const [profileId] = roster.splice(pickIndex(roster.length, draw()), 1);
    const traitDelta: Partial<BotTraitSet> = {};

    for (const trait of Object.keys(BOT_PROFILES[profileId].traits) as (keyof BotTraitSet)[]) {
      const delta = pickIndex(3, draw()) - 1;

      if (delta !== 0) {
        traitDelta[trait] = delta;
      }
    }

    // Gauntlet days already double the threat, so only solo bots start hot.
    const hotStart = !gauntlet && draw() < HOT_START_CHANCE;
    bots.push({
      profileId,
      traitDelta,
      ...(hotStart ? { startingLoadout: draw() < 0.5 ? { bombs: 2 } : { blast: 3 } } : {})
    });
  }

  return {
    dateKey,
    seed,
    arena: { cols: board.cols, rows: board.rows, preset },
    arenaSeed,
    bots,
    modifier
  };
}

export function getDailyOpponents(challenge: DailyChallenge): BotProfile[] {
  return challenge.bots.map((bot) => BOT_PROFILES[bot.profileId]);
}

export function resolveDailyModifiers(challenge: DailyChallenge): ResolvedModifiers {
  return clampModifiers(challenge.modifier.modifiers);
}

function isValidWin(win: DailyWin): boolean {
  return isDailyDateKey(win.dateKey) && Number.isFinite(win.durationMs) && win.durationMs >= 0;
}

function trimRecent(recent: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(recent)
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, RECENT_DAYS)
  );
}

/**
 * Folds one win into progress. A new latest day extends the streak when it
 * follows the last clear and restarts it otherwise; a replayed day only improves
 * its time. An older day (out of order) counts as a clear without rewriting the
 * streak; deriveDailyProgress sorts first, so its result is exact.
 */
export function applyDailyWin(progress: DailyProgress, win: DailyWin): DailyProgress {
  if (!isValidWin(win)) {
    return progress;
  }

  const durationMs = Math.round(win.durationMs);
  const bestTimeMs = progress.bestTimeMs === null ? durationMs : Math.min(progress.bestTimeMs, durationMs);
  const known = progress.recent[win.dateKey];

  if (known !== undefined || win.dateKey === progress.lastClearedKey) {
    return {
      ...progress,
      bestTimeMs,
      recent: { ...progress.recent, [win.dateKey]: Math.min(known ?? durationMs, durationMs) }
    };
  }

  const recent = trimRecent({ ...progress.recent, [win.dateKey]: durationMs });
  const last = progress.lastClearedKey;

  if (last !== null && dayNumber(win.dateKey) < dayNumber(last)) {
    return { ...progress, totalClears: progress.totalClears + 1, bestTimeMs, recent };
  }

  const runLength = last !== null && dayNumber(win.dateKey) - dayNumber(last) === 1 ? progress.runLength + 1 : 1;

  return {
    totalClears: progress.totalClears + 1,
    longestStreak: Math.max(progress.longestStreak, runLength),
    runLength,
    lastClearedKey: win.dateKey,
    bestTimeMs,
    recent
  };
}

/**
 * Derives progress from stored daily wins. Input is expected oldest first but is
 * sorted by date anyway, so duplicates and out-of-order rows give the same result.
 */
export function deriveDailyProgress(wins: DailyWin[]): DailyProgress {
  return wins
    .filter(isValidWin)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    .reduce(applyDailyWin, EMPTY_DAILY_PROGRESS);
}

/** The live streak: it survives until the end of the day after the last clear. */
export function getCurrentStreak(progress: DailyProgress, todayKey: string): number {
  if (progress.lastClearedKey === null || !isDailyDateKey(todayKey)) {
    return 0;
  }

  return dayNumber(todayKey) - dayNumber(progress.lastClearedKey) <= 1 ? progress.runLength : 0;
}

export function isDailyCleared(progress: DailyProgress, dateKey: string): boolean {
  return progress.recent[dateKey] !== undefined;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Rebuilds progress from untrusted stored data (e.g. browser storage), dropping anything invalid. */
export function sanitizeDailyProgress(value: unknown): DailyProgress {
  if (typeof value !== "object" || value === null) {
    return EMPTY_DAILY_PROGRESS;
  }

  const { totalClears, longestStreak, runLength, lastClearedKey, bestTimeMs, recent } = value as Record<
    string,
    unknown
  >;

  if (!isCount(totalClears) || !isCount(longestStreak) || !isCount(runLength)) {
    return EMPTY_DAILY_PROGRESS;
  }

  if (totalClears === 0) {
    return EMPTY_DAILY_PROGRESS;
  }

  if (
    !isDailyDateKey(lastClearedKey) ||
    runLength < 1 ||
    runLength > longestStreak ||
    longestStreak > totalClears ||
    typeof bestTimeMs !== "number" ||
    !Number.isFinite(bestTimeMs) ||
    bestTimeMs < 0
  ) {
    return EMPTY_DAILY_PROGRESS;
  }

  const cleanRecent: Record<string, number> = {};

  if (typeof recent === "object" && recent !== null) {
    for (const [key, time] of Object.entries(recent)) {
      if (isDailyDateKey(key) && typeof time === "number" && Number.isFinite(time) && time >= 0) {
        cleanRecent[key] = Math.round(time);
      }
    }
  }

  return {
    totalClears,
    longestStreak,
    runLength,
    lastClearedKey,
    bestTimeMs: Math.round(bestTimeMs),
    recent: trimRecent(cleanRecent)
  };
}
