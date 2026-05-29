import type { ArenaGrid, GridPoint } from "./arena";
import { isWalkable } from "./arena";
import { previewBlast } from "./blast";

export type BombThreat = {
  tile: GridPoint;
  range: number;
};

export function getDangerTiles(arena: ArenaGrid, bombs: BombThreat[]) {
  const danger = new Map<string, GridPoint>();

  bombs.forEach((bomb) => {
    previewBlast(arena, bomb.tile, bomb.range).tiles.forEach((tile) => {
      danger.set(tileKey(tile), tile);
    });
  });

  return Array.from(danger.values());
}

export function isDangerTile(arena: ArenaGrid, bombs: BombThreat[], tile: GridPoint) {
  return getDangerTiles(arena, bombs).some((dangerTile) => sameTile(dangerTile, tile));
}

export function chooseBotMove({
  arena,
  from,
  target,
  bombs,
  blockedTiles = []
}: {
  arena: ArenaGrid;
  from: GridPoint;
  target: GridPoint;
  bombs: BombThreat[];
  blockedTiles?: GridPoint[];
}) {
  const candidates = getAdjacentTiles(from).filter(
    (tile) => isWalkable(arena, tile) && !blockedTiles.some((blocked) => sameTile(blocked, tile))
  );

  if (candidates.length === 0) {
    return from;
  }

  const currentIsDangerous = isDangerTile(arena, bombs, from);

  if (currentIsDangerous) {
    return findSafeEscapeMove({
      arena,
      from,
      bombs,
      blockedTiles
    }) ?? from;
  }

  if (bombs.length > 0) {
    return from;
  }

  const safeCandidates = candidates.filter((tile) => !isDangerTile(arena, bombs, tile));
  const movePool = safeCandidates.length > 0 ? safeCandidates : candidates;

  return [...movePool].sort((a, b) => {
    const aDistance = manhattanDistance(a, target);
    const bDistance = manhattanDistance(b, target);

    return aDistance - bDistance;
  })[0];
}

export function findSafeEscapeMove({
  arena,
  from,
  bombs,
  blockedTiles = [],
  maxDepth = 6
}: {
  arena: ArenaGrid;
  from: GridPoint;
  bombs: BombThreat[];
  blockedTiles?: GridPoint[];
  maxDepth?: number;
}) {
  const queue: Array<{ tile: GridPoint; path: GridPoint[] }> = [{ tile: from, path: [] }];
  const visited = new Set([tileKey(from)]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.path.length > 0 && !isDangerTile(arena, bombs, current.tile)) {
      return current.path[0];
    }

    if (current.path.length >= maxDepth) {
      continue;
    }

    getAdjacentTiles(current.tile).forEach((neighbor) => {
      const key = tileKey(neighbor);

      if (visited.has(key)) {
        return;
      }

      if (!isWalkable(arena, neighbor)) {
        return;
      }

      if (blockedTiles.some((blocked) => sameTile(blocked, neighbor))) {
        return;
      }

      visited.add(key);
      queue.push({
        tile: neighbor,
        path: [...current.path, neighbor]
      });
    });
  }

  return null;
}

export function getAdjacentTiles(tile: GridPoint) {
  return [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x, y: tile.y - 1 }
  ];
}

export function manhattanDistance(a: GridPoint, b: GridPoint) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sameTile(a: GridPoint, b: GridPoint) {
  return a.x === b.x && a.y === b.y;
}

function tileKey(tile: GridPoint) {
  return `${tile.x}:${tile.y}`;
}
