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

/**
 * Soft-block layouts. Presets only change where soft blocks go: borders,
 * pillars and the four spawn corners are the same on every board.
 * - standard: the original pattern (about 60% of open cells)
 * - open-core: a cleared centre ringed by solid soft blocks
 * - maze: dense soft blocks (about 80%) with the spawns still clear
 */
export type ArenaPresetId = "standard" | "open-core" | "maze";

export type ArenaSpec = {
  cols: number;
  rows: number;
  preset: ArenaPresetId;
};

export const DEFAULT_ARENA_SPEC: ArenaSpec = {
  cols: ARENA_COLS,
  rows: ARENA_ROWS,
  preset: "standard"
};

export const MIN_ARENA_SIZE = 7;
export const MAX_ARENA_SIZE = 31;

/** Board sizes stay odd so the pillar pattern and corner spawns line up. */
export function isValidArenaSize(cols: number, rows: number) {
  return [cols, rows].every(
    (size) => Number.isInteger(size) && size % 2 === 1 && size >= MIN_ARENA_SIZE && size <= MAX_ARENA_SIZE
  );
}

function softBlockAt(spec: ArenaSpec, x: number, y: number, seed: number): boolean {
  const pattern = x * 17 + y * 29 + seed;

  if (spec.preset === "maze") {
    return pattern % 5 < 4;
  }

  if (spec.preset === "open-core") {
    const dx = Math.abs(x - (spec.cols - 1) / 2);
    const dy = Math.abs(y - (spec.rows - 1) / 2);

    if (dx <= 2 && dy <= 1) {
      return false;
    }

    if (dx <= 4 && dy <= 3) {
      return true;
    }
  }

  return pattern % 5 < 3;
}

export function createArena(spec: ArenaSpec, seed = 0): ArenaGrid {
  if (!isValidArenaSize(spec.cols, spec.rows)) {
    throw new Error(`Invalid arena size ${spec.cols}x${spec.rows}`);
  }

  const { cols, rows } = spec;

  return Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x): CellType => {
      const isBorder = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
      const isPillar = x % 2 === 0 && y % 2 === 0;
      const spawnClear =
        (x <= 2 && y <= 2) ||
        (x >= cols - 3 && y >= rows - 3) ||
        (x <= 2 && y >= rows - 3) ||
        (x >= cols - 3 && y <= 2);

      if (isBorder || isPillar) {
        return "hard";
      }

      if (spawnClear) {
        return "floor";
      }

      return softBlockAt(spec, x, y, seed) ? "soft" : "floor";
    })
  );
}

export function createInitialArena(): ArenaGrid {
  return createArena(DEFAULT_ARENA_SPEC, 0);
}

export function getArenaSize(arena: ArenaGrid): { cols: number; rows: number } {
  return { cols: arena[0]?.length ?? 0, rows: arena.length };
}

/** The four corner spawns, in the order actors take them: top-left, bottom-right, top-right, bottom-left. */
export function getSpawnPoints(arena: ArenaGrid): GridPoint[] {
  const { cols, rows } = getArenaSize(arena);

  return [
    { x: 1, y: 1 },
    { x: cols - 2, y: rows - 2 },
    { x: cols - 2, y: 1 },
    { x: 1, y: rows - 2 }
  ];
}

export function isWalkable(arena: ArenaGrid, point: GridPoint) {
  return arena[point.y]?.[point.x] === "floor";
}
