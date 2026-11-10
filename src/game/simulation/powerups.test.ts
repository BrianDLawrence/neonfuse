import { describe, expect, it } from "vitest";
import { createInitialArena } from "./arena";
import {
  applyPowerup,
  choosePowerupDrop,
  clampSpecialDropRates,
  createInitialLoadout,
  DEFAULT_POWERUP_DROP_RATES,
  DEFAULT_SPECIAL_DROP_RATES,
  hasPerk,
  MAX_LOADOUT,
  SPECIAL_POWERUP_TYPES,
  type PickupType
} from "./powerups";

function softTiles() {
  return createInitialArena().flatMap((row, y) => row.flatMap((cell, x) => (cell === "soft" ? [{ x, y }] : [])));
}

describe("choosePowerupDrop", () => {
  it("deterministically chooses a drop from a tile", () => {
    expect(choosePowerupDrop({ x: 0, y: 0 })).toBe("bomb");
    expect(choosePowerupDrop({ x: 1, y: 1 })).toBeNull();
  });

  it("uses per-type drop rates", () => {
    expect(choosePowerupDrop({ x: 0, y: 0 }, { bomb: 1, blast: 1, speed: 1 })).toBeNull();
    expect(choosePowerupDrop({ x: 0, y: 0 }, { bomb: 10, blast: 1, speed: 1 })).toBe("bomb");
    expect(choosePowerupDrop({ x: 0, y: 0 }, { bomb: 1, blast: 10, speed: 1 })).toBe("blast");
    expect(choosePowerupDrop({ x: 0, y: 0 }, { bomb: 1, blast: 1, speed: 10 })).toBe("speed");
  });

  it("never drops a perk unless a mode switches it on", () => {
    for (const tile of softTiles()) {
      const drop = choosePowerupDrop(tile);
      expect(drop === null || ["bomb", "blast", "speed"].includes(drop)).toBe(true);
      expect(choosePowerupDrop(tile, DEFAULT_POWERUP_DROP_RATES, {})).toBe(drop);
    }
  });

  it("rolls perks only where the classic roll gave nothing", () => {
    for (let y = 0; y < 31; y += 1) {
      for (let x = 0; x < 31; x += 1) {
        const classic = choosePowerupDrop({ x, y });
        const withPerks = choosePowerupDrop({ x, y }, DEFAULT_POWERUP_DROP_RATES, DEFAULT_SPECIAL_DROP_RATES);
        if (classic !== null) expect(withPerks).toBe(classic);
      }
    }
  });

  it("drops each perk at least once, and a handful in all, on the standard board", () => {
    const counts = new Map<PickupType, number>();
    for (const tile of softTiles()) {
      const drop = choosePowerupDrop(tile, DEFAULT_POWERUP_DROP_RATES, DEFAULT_SPECIAL_DROP_RATES);
      if (drop) counts.set(drop, (counts.get(drop) ?? 0) + 1);
    }
    const perks = SPECIAL_POWERUP_TYPES.map((type) => counts.get(type) ?? 0);
    expect(perks.every((count) => count >= 1)).toBe(true);
    expect(perks.reduce((sum, count) => sum + count, 0)).toBeLessThanOrEqual(8);
  });

  it("drops only the perks a mode switches on", () => {
    const visionOnly = softTiles().map((tile) => choosePowerupDrop(tile, DEFAULT_POWERUP_DROP_RATES, { vision: 3 }));
    expect(visionOnly).toContain("vision");
    expect(visionOnly.some((drop) => drop === "shield" || drop === "kick" || drop === "remote")).toBe(false);
  });

  it("moves perks with the seed and repeats for the same seed", () => {
    const roll = (seed: number) =>
      softTiles().map((tile) => choosePowerupDrop(tile, DEFAULT_POWERUP_DROP_RATES, DEFAULT_SPECIAL_DROP_RATES, seed));
    expect(roll(7)).toEqual(roll(7));
    expect(roll(7)).not.toEqual(roll(0));
  });
});

describe("clampSpecialDropRates", () => {
  it("rounds, bounds to 0-10 and drops perks that are off", () => {
    expect(clampSpecialDropRates({ shield: 14, vision: 2.6, kick: 0, remote: -3 })).toEqual({ shield: 10, vision: 3 });
    expect(clampSpecialDropRates({ shield: Number.NaN })).toEqual({});
  });
});

describe("applyPowerup", () => {
  it("increments the matching stat", () => {
    const loadout = createInitialLoadout();

    expect(applyPowerup(loadout, "bomb")).toMatchObject({ bombs: 2, blast: 2, speed: 1 });
    expect(applyPowerup(loadout, "blast")).toMatchObject({ bombs: 1, blast: 3, speed: 1 });
    expect(applyPowerup(loadout, "speed")).toMatchObject({ bombs: 1, blast: 2, speed: 2 });
  });

  it("caps upgraded stats", () => {
    expect(applyPowerup(MAX_LOADOUT, "bomb")).toEqual(MAX_LOADOUT);
  });

  it("starts with no perks and holds at most one of each", () => {
    const loadout = createInitialLoadout();
    for (const perk of SPECIAL_POWERUP_TYPES) {
      expect(hasPerk(loadout, perk)).toBe(false);
      const held = applyPowerup(loadout, perk);
      expect(held[perk]).toBe(1);
      expect(applyPowerup(held, perk)).toEqual(held);
      expect({ ...held, [perk]: 0 }).toEqual(loadout);
    }
  });

  it("reads a loadout without perk fields as holding none", () => {
    expect(hasPerk({ bombs: 1, blast: 2, speed: 1 }, "shield")).toBe(false);
    expect(hasPerk(undefined, "remote")).toBe(false);
  });
});
