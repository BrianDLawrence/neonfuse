import type { GridPoint } from "./arena";
import { hashString } from "./seed";

/** The classic stat upgrades. Their drop rates are what stages, Daily Fuse and the admin sliders tune. */
export type PowerupType = "bomb" | "blast" | "speed";

/**
 * Perks: one-of-a-kind pickups that a fighter either holds or does not.
 * They come from their own drop table, and a mode switches each one on.
 */
export type SpecialPowerupType = "shield" | "vision" | "kick" | "remote";

/** Anything that can lie on the floor after a block breaks. */
export type PickupType = PowerupType | SpecialPowerupType;

export type PowerupDropRates = Record<PowerupType, number>;

/** Per-perk drop rates, each 0–10; a missing or zero rate never drops that perk. */
export type SpecialDropRates = Partial<Record<SpecialPowerupType, number>>;

export type PlayerLoadout = {
  bombs: number;
  blast: number;
  speed: number;
  /** Perks are 0 or 1: held or not. */
  shield: number;
  vision: number;
  kick: number;
  remote: number;
};

export type ActorLoadout = PlayerLoadout;

export const SPECIAL_POWERUP_TYPES: readonly SpecialPowerupType[] = ["shield", "vision", "kick", "remote"];

export const DEFAULT_POWERUP_DROP_RATES: PowerupDropRates = {
  bomb: 4,
  blast: 4,
  speed: 4
};

/** Starting rates for a mode that turns every perk on. Guesses to tune by play. */
export const DEFAULT_SPECIAL_DROP_RATES: Record<SpecialPowerupType, number> = {
  shield: 3,
  vision: 3,
  kick: 2,
  remote: 2
};

export const MAX_LOADOUT: PlayerLoadout = {
  bombs: 4,
  blast: 5,
  speed: 3,
  shield: 1,
  vision: 1,
  kick: 1,
  remote: 1
};

const POWERUP_DROP_SALTS: Record<PowerupType, number> = {
  bomb: 11,
  blast: 37,
  speed: 23
};


export function createInitialLoadout(): PlayerLoadout {
  return {
    bombs: 1,
    blast: 2,
    speed: 1,
    shield: 0,
    vision: 0,
    kick: 0,
    remote: 0
  };
}

/**
 * The pickup a broken block leaves, from the tile alone (plus an optional seed for perks).
 * The classic roll is unchanged. Perks roll only on tiles where the classic roll gave
 * nothing, so switching perks on never moves or removes a classic upgrade.
 */
export function choosePowerupDrop(
  tile: GridPoint,
  rates: PowerupDropRates = DEFAULT_POWERUP_DROP_RATES,
  specials: SpecialDropRates | null = null,
  seed = 0
): PickupType | null {
  const classic = chooseClassicDrop(tile, rates);

  if (classic || !specials) {
    return classic;
  }

  const candidates = SPECIAL_POWERUP_TYPES.map((type) => {
    const threshold = clampSpecialRate(specials[type]) * 3;
    // Each perk hashes the tile on its own, so the perk rolls are independent of each other.
    const roll = hashString(`perkdrop:${type}:${tile.x}:${tile.y}:${seed}`) % 100;

    return { type, score: threshold > 0 ? roll / threshold : Infinity, shouldDrop: roll < threshold };
  }).filter((candidate) => candidate.shouldDrop);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => a.score - b.score)[0].type;
}

function chooseClassicDrop(tile: GridPoint, rates: PowerupDropRates): PowerupType | null {
  const candidates = (["bomb", "blast", "speed"] as const)
    .map((type) => {
      const rate = clampDropRate(rates[type]);
      const threshold = rate * 6;
      const roll = positiveModulo(tile.x * 31 + tile.y * 17 + POWERUP_DROP_SALTS[type], 100);

      return {
        type,
        score: roll / threshold,
        shouldDrop: roll < threshold
      };
    })
    .filter((candidate) => candidate.shouldDrop);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => a.score - b.score)[0].type;
}

/** Rounds and bounds every perk rate to 0–10, dropping the ones that are off. */
export function clampSpecialDropRates(rates: SpecialDropRates): SpecialDropRates {
  const clamped: SpecialDropRates = {};

  for (const type of SPECIAL_POWERUP_TYPES) {
    const rate = clampSpecialRate(rates[type]);

    if (rate > 0) {
      clamped[type] = rate;
    }
  }

  return clamped;
}

export function isSpecialPowerup(type: PickupType): type is SpecialPowerupType {
  return (SPECIAL_POWERUP_TYPES as readonly string[]).includes(type);
}

/**
 * Whether a loadout holds a perk. A snapshot from a server that predates perks
 * has no perk fields, which reads as not held.
 */
export function hasPerk(loadout: Partial<PlayerLoadout> | null | undefined, perk: SpecialPowerupType): boolean {
  return (loadout?.[perk] ?? 0) >= 1;
}

/** The perks a loadout holds, in display order. */
export function heldPerks(loadout: Partial<PlayerLoadout> | null | undefined): SpecialPowerupType[] {
  return SPECIAL_POWERUP_TYPES.filter((perk) => hasPerk(loadout, perk));
}

export function applyPowerup(loadout: PlayerLoadout, powerup: PickupType): PlayerLoadout {
  if (powerup === "bomb") {
    return {
      ...loadout,
      bombs: Math.min(loadout.bombs + 1, MAX_LOADOUT.bombs)
    };
  }

  if (powerup === "blast") {
    return {
      ...loadout,
      blast: Math.min(loadout.blast + 1, MAX_LOADOUT.blast)
    };
  }

  if (powerup === "speed") {
    return {
      ...loadout,
      speed: Math.min(loadout.speed + 1, MAX_LOADOUT.speed)
    };
  }

  // A perk is held or not: a second copy is used up and changes nothing.
  return {
    ...loadout,
    [powerup]: MAX_LOADOUT[powerup]
  };
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function clampDropRate(rate: number) {
  return Math.min(10, Math.max(1, Math.round(rate)));
}

function clampSpecialRate(rate: number | undefined) {
  if (rate === undefined || !Number.isFinite(rate)) {
    return 0;
  }

  return Math.min(10, Math.max(0, Math.round(rate)));
}
