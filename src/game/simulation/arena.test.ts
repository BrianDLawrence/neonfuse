import { describe, expect, it } from "vitest";
import {
  ARENA_COLS,
  ARENA_ROWS,
  DEFAULT_ARENA_SPEC,
  createArena,
  createInitialArena,
  directionToDelta,
  getArenaSize,
  getSpawnPoints,
  isValidArenaSize,
  isWalkable,
  type ArenaGrid,
  type CellType,
  type Direction
} from "./arena";

describe("directionToDelta", () => {
  it("maps each direction to a single-step grid delta", () => {
    expect(directionToDelta("up")).toEqual({ x: 0, y: -1 });
    expect(directionToDelta("down")).toEqual({ x: 0, y: 1 });
    expect(directionToDelta("left")).toEqual({ x: -1, y: 0 });
    expect(directionToDelta("right")).toEqual({ x: 1, y: 0 });
  });

  it("only ever moves one tile along one axis", () => {
    const directions: Direction[] = ["up", "down", "left", "right"];

    for (const direction of directions) {
      const delta = directionToDelta(direction);
      expect(Math.abs(delta.x) + Math.abs(delta.y)).toBe(1);
    }
  });
});

// The pre-spec board, restated so createInitialArena can't drift from it.
function legacyArena(): CellType[][] {
  return Array.from({ length: ARENA_ROWS }, (_, y) =>
    Array.from({ length: ARENA_COLS }, (_, x): CellType => {
      if (x === 0 || y === 0 || x === ARENA_COLS - 1 || y === ARENA_ROWS - 1) return "hard";
      if (x % 2 === 0 && y % 2 === 0) return "hard";
      if (
        (x <= 2 && y <= 2) ||
        (x >= ARENA_COLS - 3 && y >= ARENA_ROWS - 3) ||
        (x <= 2 && y >= ARENA_ROWS - 3) ||
        (x >= ARENA_COLS - 3 && y <= 2)
      ) {
        return "floor";
      }
      return (x * 17 + y * 29) % 5 < 3 ? "soft" : "floor";
    })
  );
}

function countCells(arena: ArenaGrid, type: CellType) {
  return arena.flat().filter((cell) => cell === type).length;
}

describe("createArena", () => {
  it("reproduces the original board for the default spec", () => {
    expect(createInitialArena()).toEqual(legacyArena());
    expect(createArena(DEFAULT_ARENA_SPEC, 0)).toEqual(legacyArena());
  });

  it("is deterministic for a spec and seed", () => {
    const spec = { ...DEFAULT_ARENA_SPEC, preset: "maze" as const };

    expect(createArena(spec, 7)).toEqual(createArena(spec, 7));
  });

  it("builds the requested odd board size with a hard border", () => {
    const arena = createArena({ cols: 19, rows: 15, preset: "standard" });

    expect(getArenaSize(arena)).toEqual({ cols: 19, rows: 15 });
    expect(arena[0].every((cell) => cell === "hard")).toBe(true);
    expect(arena.every((row) => row[0] === "hard" && row[18] === "hard")).toBe(true);
  });

  it("rejects even or out-of-range sizes", () => {
    expect(isValidArenaSize(14, 11)).toBe(false);
    expect(isValidArenaSize(5, 5)).toBe(false);
    expect(isValidArenaSize(33, 11)).toBe(false);
    expect(() => createArena({ cols: 12, rows: 11, preset: "standard" })).toThrow();
  });

  it.each(["standard", "open-core", "maze"] as const)("keeps every spawn corner open on %s", (preset) => {
    const arena = createArena({ ...DEFAULT_ARENA_SPEC, preset });

    for (const spawn of getSpawnPoints(arena)) {
      expect(isWalkable(arena, spawn)).toBe(true);
      // Each spawn has two open neighbours, so the first bomb always has an escape.
      const open = [
        { x: spawn.x + 1, y: spawn.y },
        { x: spawn.x - 1, y: spawn.y },
        { x: spawn.x, y: spawn.y + 1 },
        { x: spawn.x, y: spawn.y - 1 }
      ].filter((tile) => isWalkable(arena, tile));
      expect(open.length).toBe(2);
    }
  });

  it("only moves soft blocks between presets", () => {
    const standard = createArena(DEFAULT_ARENA_SPEC);

    for (const preset of ["open-core", "maze"] as const) {
      const arena = createArena({ ...DEFAULT_ARENA_SPEC, preset });

      arena.forEach((row, y) =>
        row.forEach((cell, x) => expect(cell === "hard").toBe(standard[y][x] === "hard"))
      );
    }
  });

  it("clears the centre on open-core and packs blocks on maze", () => {
    const standard = createArena(DEFAULT_ARENA_SPEC);
    const openCore = createArena({ ...DEFAULT_ARENA_SPEC, preset: "open-core" });
    const maze = createArena({ ...DEFAULT_ARENA_SPEC, preset: "maze" });

    expect(openCore[5][5]).toBe("floor");
    expect(openCore[5][7]).toBe("floor");
    expect(openCore[2][3]).toBe("soft");
    expect(countCells(maze, "soft")).toBeGreaterThan(countCells(standard, "soft"));
  });
});

describe("getSpawnPoints", () => {
  it("returns the four inner corners, player corner first", () => {
    expect(getSpawnPoints(createInitialArena())).toEqual([
      { x: 1, y: 1 },
      { x: 11, y: 9 },
      { x: 11, y: 1 },
      { x: 1, y: 9 }
    ]);
  });
});
