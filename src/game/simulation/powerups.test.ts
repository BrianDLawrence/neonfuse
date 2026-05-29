import { describe, expect, it } from "vitest";
import { applyPowerup, choosePowerupDrop, createInitialLoadout } from "./powerups";

describe("choosePowerupDrop", () => {
  it("deterministically chooses a drop from a tile", () => {
    expect(choosePowerupDrop({ x: 1, y: 0 })).toBe("blast");
    expect(choosePowerupDrop({ x: 1, y: 1 })).toBeNull();
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
