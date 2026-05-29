import { describe, expect, it } from "vitest";
import type { ArenaGrid } from "./arena";
import { chooseBotMove, findSafeEscapeMove, getDangerTiles, isDangerTile } from "./danger";

function makeArena(): ArenaGrid {
  return [
    ["hard", "hard", "hard", "hard", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "hard", "hard", "hard", "hard"]
  ];
}

describe("getDangerTiles", () => {
  it("marks bomb blast lanes as dangerous", () => {
    const danger = getDangerTiles(makeArena(), [{ tile: { x: 2, y: 2 }, range: 1 }]);

    expect(danger).toContainEqual({ x: 2, y: 2 });
    expect(danger).toContainEqual({ x: 3, y: 2 });
    expect(danger).toContainEqual({ x: 2, y: 1 });
    expect(danger).not.toContainEqual({ x: 1, y: 1 });
  });
});

describe("isDangerTile", () => {
  it("detects whether a tile is threatened", () => {
    const arena = makeArena();
    const bombs = [{ tile: { x: 2, y: 2 }, range: 1 }];

    expect(isDangerTile(arena, bombs, { x: 2, y: 1 })).toBe(true);
    expect(isDangerTile(arena, bombs, { x: 1, y: 1 })).toBe(false);
  });
});

describe("chooseBotMove", () => {
  it("moves toward the target when not in danger", () => {
    const next = chooseBotMove({
      arena: makeArena(),
      from: { x: 1, y: 1 },
      target: { x: 3, y: 1 },
      bombs: []
    });

    expect(next).toEqual({ x: 2, y: 1 });
  });

  it("avoids dangerous tiles", () => {
    const next = chooseBotMove({
      arena: makeArena(),
      from: { x: 1, y: 1 },
      target: { x: 3, y: 1 },
      bombs: [{ tile: { x: 2, y: 1 }, range: 1 }]
    });

    expect(next).toEqual({ x: 1, y: 2 });
  });

  it("moves along an escape path when adjacent tiles are still dangerous", () => {
    const next = chooseBotMove({
      arena: makeArena(),
      from: { x: 2, y: 2 },
      target: { x: 2, y: 1 },
      bombs: [{ tile: { x: 2, y: 2 }, range: 2 }],
      blockedTiles: [{ x: 2, y: 2 }]
    });

    expect(next).toEqual({ x: 3, y: 2 });
  });

  it("holds position when already safe while a bomb is active", () => {
    const next = chooseBotMove({
      arena: makeArena(),
      from: { x: 1, y: 1 },
      target: { x: 3, y: 1 },
      bombs: [{ tile: { x: 3, y: 3 }, range: 1 }]
    });

    expect(next).toEqual({ x: 1, y: 1 });
  });
});

describe("findSafeEscapeMove", () => {
  it("finds a first step toward a safe tile after planting a bomb", () => {
    const next = findSafeEscapeMove({
      arena: makeArena(),
      from: { x: 2, y: 2 },
      bombs: [{ tile: { x: 2, y: 2 }, range: 2 }],
      blockedTiles: [{ x: 2, y: 2 }]
    });

    expect(next).toEqual({ x: 3, y: 2 });
  });

  it("returns null when no escape route exists", () => {
    const boxedInArena: ArenaGrid = [
      ["hard", "hard", "hard"],
      ["hard", "floor", "hard"],
      ["hard", "hard", "hard"]
    ];

    const next = findSafeEscapeMove({
      arena: boxedInArena,
      from: { x: 1, y: 1 },
      bombs: [{ tile: { x: 1, y: 1 }, range: 2 }],
      blockedTiles: [{ x: 1, y: 1 }]
    });

    expect(next).toBeNull();
  });
});
