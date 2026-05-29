import type { GridPoint } from "./arena";

export type PowerupType = "bomb" | "blast" | "speed";

export type PlayerLoadout = {
  bombs: number;
  blast: number;
  speed: number;
};

const MAX_LOADOUT: PlayerLoadout = {
  bombs: 4,
  blast: 5,
  speed: 3
};

export function createInitialLoadout(): PlayerLoadout {
  return {
    bombs: 1,
    blast: 2,
    speed: 1
  };
}

export function choosePowerupDrop(tile: GridPoint): PowerupType | null {
  const roll = positiveModulo(tile.x * 31 + tile.y * 17, 100);

  if (roll >= 42) {
    return null;
  }

  const typeIndex = positiveModulo(tile.x * 13 + tile.y * 7, 3);
  return (["bomb", "blast", "speed"] as const)[typeIndex];
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
