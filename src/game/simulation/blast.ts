import type { ArenaGrid, GridPoint } from "./arena";

export type BlastResult = {
  tiles: GridPoint[];
  clearedBlocks: GridPoint[];
};

const BLAST_DIRECTIONS: GridPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

export function resolveBlast(arena: ArenaGrid, origin: GridPoint, range: number): BlastResult {
  const tiles: GridPoint[] = [origin];
  const clearedBlocks: GridPoint[] = [];

  BLAST_DIRECTIONS.forEach((direction) => {
    for (let distance = 1; distance <= range; distance += 1) {
      const tile = {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance
      };

      const cell = arena[tile.y]?.[tile.x];

      if (!cell || cell === "hard") {
        break;
      }

      tiles.push(tile);

      if (cell === "soft") {
        arena[tile.y][tile.x] = "floor";
        clearedBlocks.push(tile);
        break;
      }
    }
  });

  return { tiles, clearedBlocks };
}

export function tileListIncludes(tiles: GridPoint[], target: GridPoint) {
  return tiles.some((tile) => tile.x === target.x && tile.y === target.y);
}
