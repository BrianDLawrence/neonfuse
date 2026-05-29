import { describe, expect, it } from "vitest";
import type { ArenaGrid } from "./arena";
import { previewBlast, resolveBlast, tileListIncludes } from "./blast";

function makeArena(): ArenaGrid {
  return [
    ["hard", "hard", "hard", "hard", "hard"],
    ["hard", "floor", "floor", "soft", "hard"],
    ["hard", "floor", "hard", "floor", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "hard", "hard", "hard", "hard"]
  ];
}

describe("resolveBlast", () => {
  it("includes the origin tile", () => {
    const result = resolveBlast(makeArena(), { x: 1, y: 1 }, 2);

    expect(result.tiles).toContainEqual({ x: 1, y: 1 });
  });

  it("stops at hard blocks without including them", () => {
    const result = resolveBlast(makeArena(), { x: 1, y: 1 }, 4);

    expect(result.tiles).not.toContainEqual({ x: 0, y: 1 });
    expect(result.tiles).not.toContainEqual({ x: 2, y: 2 });
  });

  it("clears one soft block and stops in that direction", () => {
    const arena = makeArena();
    const result = resolveBlast(arena, { x: 1, y: 1 }, 4);

    expect(result.tiles).toContainEqual({ x: 3, y: 1 });
    expect(result.clearedBlocks).toEqual([{ x: 3, y: 1 }]);
    expect(arena[1][3]).toBe("floor");
  });
});

describe("previewBlast", () => {
  it("does not mutate soft blocks", () => {
    const arena = makeArena();
    const result = previewBlast(arena, { x: 1, y: 1 }, 4);

    expect(result.clearedBlocks).toEqual([{ x: 3, y: 1 }]);
    expect(arena[1][3]).toBe("soft");
  });
});

describe("tileListIncludes", () => {
  it("detects whether a tile exists in a tile list", () => {
    expect(tileListIncludes([{ x: 1, y: 2 }], { x: 1, y: 2 })).toBe(true);
    expect(tileListIncludes([{ x: 1, y: 2 }], { x: 2, y: 1 })).toBe(false);
  });
});
