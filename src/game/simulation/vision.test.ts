import { describe, expect, it } from "vitest";
import type { ArenaGrid } from "./arena";
import { getDangerTiles } from "./danger";
import { canSeeBlastZones, visibleDangerTiles } from "./vision";

const arena: ArenaGrid = [
  ["hard", "hard", "hard", "hard", "hard"],
  ["hard", "floor", "floor", "floor", "hard"],
  ["hard", "floor", "hard", "floor", "hard"],
  ["hard", "floor", "floor", "floor", "hard"],
  ["hard", "hard", "hard", "hard", "hard"]
];
const bombs = [{ tile: { x: 1, y: 1 }, range: 2 }];

describe("blast zone vision", () => {
  it("hides blast zones from a fighter without Vision", () => {
    expect(canSeeBlastZones({ viewer: { vision: 0 } })).toBe(false);
    expect(visibleDangerTiles({ arena, bombs, viewer: { vision: 0 } })).toEqual([]);
  });

  it("shows every bomb's blast zone to a fighter holding Vision", () => {
    expect(visibleDangerTiles({ arena, bombs, viewer: { vision: 1 } })).toEqual(getDangerTiles(arena, bombs));
    expect(visibleDangerTiles({ arena, bombs, viewer: { vision: 1 } }).length).toBeGreaterThan(1);
  });

  it("shows blast zones to spectators, who have no fighter on the board", () => {
    expect(canSeeBlastZones({ viewer: null })).toBe(true);
  });

  it("shows blast zones when the player turns on the accessibility setting", () => {
    expect(canSeeBlastZones({ viewer: { vision: 0 }, alwaysShow: true })).toBe(true);
  });

  it("reads a loadout without a vision field as not holding it", () => {
    expect(canSeeBlastZones({ viewer: {} })).toBe(false);
  });
});
