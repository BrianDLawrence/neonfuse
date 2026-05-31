export const ARENA_COLS = 13;
export const ARENA_ROWS = 11;
export const CELL_SIZE = 48;

export type CellType = "floor" | "hard" | "soft";

export type GridPoint = {
  x: number;
  y: number;
};

export type Direction = "up" | "down" | "left" | "right";

const DIRECTION_DELTAS: Record<Direction, GridPoint> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

export function directionToDelta(direction: Direction): GridPoint {
  return DIRECTION_DELTAS[direction];
}

export type ArenaGrid = CellType[][];

export function createInitialArena(): ArenaGrid {
  return Array.from({ length: ARENA_ROWS }, (_, y) =>
    Array.from({ length: ARENA_COLS }, (_, x): CellType => {
      const isBorder = x === 0 || y === 0 || x === ARENA_COLS - 1 || y === ARENA_ROWS - 1;
      const isPillar = x % 2 === 0 && y % 2 === 0;
      const spawnClear =
        (x <= 2 && y <= 2) ||
        (x >= ARENA_COLS - 3 && y >= ARENA_ROWS - 3) ||
        (x <= 2 && y >= ARENA_ROWS - 3) ||
        (x >= ARENA_COLS - 3 && y <= 2);

      if (isBorder || isPillar) {
        return "hard";
      }

      if (spawnClear) {
        return "floor";
      }

      return (x * 17 + y * 29) % 5 < 3 ? "soft" : "floor";
    })
  );
}

export function isWalkable(arena: ArenaGrid, point: GridPoint) {
  return arena[point.y]?.[point.x] === "floor";
}
