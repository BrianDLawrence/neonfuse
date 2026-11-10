import { directionToDelta, isWalkable, type ArenaGrid, type Direction, type GridPoint } from "./arena";
import type { BombThreat } from "./danger";

/** A kicked bomb moves one tile this often. A guess to tune by play. */
export const KICK_STEP_MS = 100;

export type BombSlide = { direction: Direction; nextStepAt: number };

export type KickableBomb = { id: number; tile: GridPoint; slide?: BombSlide };

/** What a sliding bomb can bump into: walls and blocks, other bombs, and living fighters. */
export type SlideBoard = {
  arena: ArenaGrid;
  bombs: readonly KickableBomb[];
  /** Tiles of living fighters. */
  fighters: readonly GridPoint[];
};

function step(tile: GridPoint, direction: Direction): GridPoint {
  const delta = directionToDelta(direction);
  return { x: tile.x + delta.x, y: tile.y + delta.y };
}

function sameTile(a: GridPoint, b: GridPoint) {
  return a.x === b.x && a.y === b.y;
}

/** True when a bomb can't slide onto `tile`. Pickups don't stop a bomb. */
export function isSlideBlocked(board: SlideBoard, tile: GridPoint, movingId: number): boolean {
  return (
    !isWalkable(board.arena, tile) ||
    board.bombs.some((bomb) => bomb.id !== movingId && sameTile(bomb.tile, tile)) ||
    board.fighters.some((fighter) => sameTile(fighter, tile))
  );
}

/**
 * A fighter holding Kick steps toward `direction` from `from`. If a resting bomb sits on
 * that tile and the tile beyond it is free, returns the bomb and its new slide; the
 * kicker stays put. Otherwise null, and the move is simply blocked as before.
 */
export function tryKick(board: SlideBoard, from: GridPoint, direction: Direction, time: number): { bombId: number; slide: BombSlide } | null {
  const target = step(from, direction);
  const bomb = board.bombs.find((candidate) => sameTile(candidate.tile, target));

  if (!bomb || bomb.slide || isSlideBlocked(board, step(target, direction), bomb.id)) {
    return null;
  }

  return { bombId: bomb.id, slide: { direction, nextStepAt: time + KICK_STEP_MS } };
}

/**
 * One step of a sliding bomb: the tile it moves to, and whether it has stopped. It stops
 * on arriving in front of anything that blocks it, and stays put if already blocked.
 */
export function slideOnce(board: SlideBoard, bomb: KickableBomb & { slide: BombSlide }): { tile: GridPoint; stopped: boolean } {
  const next = step(bomb.tile, bomb.slide.direction);

  if (isSlideBlocked(board, next, bomb.id)) {
    return { tile: bomb.tile, stopped: true };
  }

  return { tile: next, stopped: isSlideBlocked(board, step(next, bomb.slide.direction), bomb.id) };
}

/**
 * Moves every sliding bomb up to `time`, one tile per KICK_STEP_MS, catching up when a
 * tick runs late. Steps resolve in time order (then bomb ID), so two bombs sliding at
 * each other stop deterministically. Fuses are untouched: a bomb explodes where it is.
 */
export function stepSlides<B extends KickableBomb>(board: Omit<SlideBoard, "bombs">, bombs: readonly B[], time: number): B[] {
  const next = bombs.map((bomb) => ({ ...bomb }));

  for (;;) {
    const due = next
      .filter((bomb): bomb is B & { slide: BombSlide } => !!bomb.slide && bomb.slide.nextStepAt <= time)
      .sort((a, b) => a.slide.nextStepAt - b.slide.nextStepAt || a.id - b.id)[0];

    if (!due) {
      return next;
    }

    const moved = slideOnce({ ...board, bombs: next }, due);
    due.tile = moved.tile;

    if (moved.stopped) {
      delete (due as KickableBomb).slide;
    } else {
      due.slide = { ...due.slide, nextStepAt: due.slide.nextStepAt + KICK_STEP_MS };
    }
  }
}

/** Where a sliding bomb will come to rest if nothing on the board moves. Bots treat it as a threat. */
export function projectSlideStop(board: SlideBoard, bomb: KickableBomb): GridPoint {
  if (!bomb.slide) {
    return bomb.tile;
  }

  let tile = bomb.tile;
  const limit = board.arena.length + (board.arena[0]?.length ?? 0);

  for (let steps = 0; steps < limit; steps += 1) {
    const next = step(tile, bomb.slide.direction);
    if (isSlideBlocked(board, next, bomb.id)) break;
    tile = next;
  }

  return tile;
}

/**
 * Bomb threats for danger checks: each bomb where it is, plus a sliding bomb where it
 * will stop, so bots keep out of a kicked bomb's path. Resting bombs are unchanged.
 */
export function slideAwareThreats(board: Omit<SlideBoard, "bombs">, bombs: readonly (KickableBomb & { range: number })[]): BombThreat[] {
  return bombs.flatMap((bomb) => {
    const here = { tile: bomb.tile, range: bomb.range };
    if (!bomb.slide) return [here];
    const stop = projectSlideStop({ ...board, bombs }, bomb);
    return stop.x === bomb.tile.x && stop.y === bomb.tile.y ? [here] : [here, { tile: stop, range: bomb.range }];
  });
}
