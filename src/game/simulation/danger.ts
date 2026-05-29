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

  const safeCandidates = candidates.filter((tile) => !isDangerTile(arena, bombs, tile));
  const currentIsDangerous = isDangerTile(arena, bombs, from);
  const movePool = safeCandidates.length > 0 ? safeCandidates : candidates;

  return [...movePool].sort((a, b) => {
    const aDistance = manhattanDistance(a, target);
    const bDistance = manhattanDistance(b, target);

    if (currentIsDangerous) {
      return bDistance - aDistance;
    }

    return aDistance - bDistance;
  })[0];
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
