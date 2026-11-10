import type { ArenaGrid, GridPoint } from "./arena";
import { previewBlast, tileListIncludes } from "./blast";

/**
 * A remote bomb's own fuse. It still goes off by itself, so a fighter who is knocked
 * out or leaves can never leave bombs on the board forever. A guess to tune by play.
 */
export const REMOTE_FUSE_MS = 4000;

/** A remote bomb can't be set off until this long after planting. */
export const REMOTE_ARM_MS = 250;

export type RemoteBomb = {
  id: number;
  /** A seat on the server, an actor ID in local rounds. */
  owner: number | string;
  tile: GridPoint;
  range: number;
  /** True for a bomb planted while its owner held the Remote perk. */
  remote?: boolean;
  plantedAt?: number;
};

/** The fuse for a bomb planted now: the long remote fuse when the planter holds Remote. */
export function plantFuseMs(holdsRemote: boolean, normalFuseMs: number): number {
  return holdsRemote ? REMOTE_FUSE_MS : normalFuseMs;
}

/** Whether a remote bomb can be set off at `time`. */
export function isRemoteArmed(bomb: RemoteBomb, time: number): boolean {
  return Boolean(bomb.remote) && time >= (bomb.plantedAt ?? 0) + REMOTE_ARM_MS;
}

/**
 * The bomb a detonate input sets off: the owner's oldest armed remote bomb, or null when
 * there is none. Callers make it explode now; chains then follow the normal rules.
 */
export function chooseDetonation(bombs: readonly RemoteBomb[], owner: number | string, time: number): number | null {
  const armed = bombs
    .filter((bomb) => bomb.owner === owner && isRemoteArmed(bomb, time))
    .sort((a, b) => (a.plantedAt ?? 0) - (b.plantedAt ?? 0) || a.id - b.id);

  return armed[0]?.id ?? null;
}

/** Every tile a bomb's blast reaches, following the other bombs it would set off. */
export function chainBlastTiles(arena: ArenaGrid, bombs: readonly RemoteBomb[], startId: number): GridPoint[] {
  const start = bombs.find((bomb) => bomb.id === startId);

  if (!start) {
    return [];
  }

  const tiles: GridPoint[] = [];
  const queue = [start];
  const done = new Set<number>([start.id]);

  while (queue.length > 0) {
    const bomb = queue.shift()!;
    const blast = previewBlast(arena, bomb.tile, bomb.range).tiles;
    tiles.push(...blast);

    for (const other of bombs) {
      if (!done.has(other.id) && tileListIncludes(blast, other.tile)) {
        done.add(other.id);
        queue.push(other);
      }
    }
  }

  return tiles;
}

/**
 * When a bot sets off its remote bomb. Only when the bot is clear of the whole chain, and
 * then either a rival is caught in it or the bomb has been held for `holdMs` (the bot's
 * normal fuse, so a bot with Remote keeps today's pace). Pure and deterministic.
 */
export function chooseBotDetonation({
  arena,
  owner,
  actorTile,
  rivals,
  bombs,
  time,
  holdMs
}: {
  arena: ArenaGrid;
  owner: number | string;
  actorTile: GridPoint;
  rivals: readonly GridPoint[];
  bombs: readonly RemoteBomb[];
  time: number;
  holdMs: number;
}): number | null {
  const id = chooseDetonation(bombs, owner, time);

  if (id === null) {
    return null;
  }

  const chain = chainBlastTiles(arena, bombs, id);

  if (tileListIncludes(chain, actorTile)) {
    return null;
  }

  const bomb = bombs.find((candidate) => candidate.id === id)!;
  const heldLongEnough = time - (bomb.plantedAt ?? 0) >= holdMs;

  return rivals.some((rival) => tileListIncludes(chain, rival)) || heldLongEnough ? id : null;
}
