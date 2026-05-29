import { describe, expect, it } from "vitest";
import { applyPowerup, choosePowerupDrop, createInitialLoadout } from "./powerups";

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
});

describe("applyPowerup", () => {
  it("increments the matching stat", () => {
    const loadout = createInitialLoadout();

    expect(applyPowerup(loadout, "bomb")).toEqual({ bombs: 2, blast: 2, speed: 1 });
    expect(applyPowerup(loadout, "blast")).toEqual({ bombs: 1, blast: 3, speed: 1 });
    expect(applyPowerup(loadout, "speed")).toEqual({ bombs: 1, blast: 2, speed: 2 });
  });

  it("caps upgraded stats", () => {
    expect(applyPowerup({ bombs: 4, blast: 5, speed: 3 }, "bomb")).toEqual({
      bombs: 4,
      blast: 5,
      speed: 3
    });
  });
});
