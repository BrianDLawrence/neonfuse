import type { GridPoint } from "./arena";

export type PowerupType = "bomb" | "blast" | "speed";

export type PowerupDropRates = Record<PowerupType, number>;

export type PlayerLoadout = {
  bombs: number;
  blast: number;
  speed: number;
};

export const DEFAULT_POWERUP_DROP_RATES: PowerupDropRates = {
  bomb: 4,
  blast: 4,
  speed: 4
};

const MAX_LOADOUT: PlayerLoadout = {
  bombs: 4,
  blast: 5,
  speed: 3
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
    speed: 1
  };
}

export function choosePowerupDrop(
  tile: GridPoint,
  rates: PowerupDropRates = DEFAULT_POWERUP_DROP_RATES
): PowerupType | null {
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

export function applyPowerup(loadout: PlayerLoadout, powerup: PowerupType): PlayerLoadout {
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

  return {
    ...loadout,
    speed: Math.min(loadout.speed + 1, MAX_LOADOUT.speed)
  };
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function clampDropRate(rate: number) {
  return Math.min(10, Math.max(1, Math.round(rate)));
}
