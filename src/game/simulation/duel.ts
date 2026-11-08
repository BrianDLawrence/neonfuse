import { createInitialArena, directionToDelta, getSpawnPoints, isWalkable, type ArenaGrid, type Direction, type GridPoint } from "./arena";
import { resolveBlast, tileListIncludes } from "./blast";
import { applyPowerup, choosePowerupDrop, createInitialLoadout, type ActorLoadout, type PowerupType } from "./powerups";

export type Seat = 0 | 1 | 2 | 3;
export type SeatCount = 2 | 3 | 4;
export type DuelCommand = { type: "move"; direction: Direction } | { type: "bomb" };
export type DuelState = {
  time: number;
  startsAt: number;
  arena: ArenaGrid;
  players: { tile: GridPoint; alive: boolean; loadout: ActorLoadout; nextMoveAt: number }[];
  bombs: { id: number; owner: Seat; tile: GridPoint; range: number; explodesAt: number }[];
  explosions: { id: number; tiles: GridPoint[]; clearedBlocks: GridPoint[]; expiresAt: number }[];
  powerups: { tile: GridPoint; type: PowerupType }[];
  nextBombId: number;
  winner: Seat | "draw" | null;
  reason: "blast" | "forfeit" | "timeout" | "abandoned" | null;
};

/** Two seats is the friend duel; three or four take the remaining corners in `getSpawnPoints` order. */
export function createDuel(seats: SeatCount = 2): DuelState {
  const arena = createInitialArena();
  return {
    time: 0, startsAt: 3000, arena,
    players: getSpawnPoints(arena).slice(0, seats).map((tile) => ({
      tile, alive: true, loadout: createInitialLoadout(), nextMoveAt: 0
    })),
    bombs: [], explosions: [], powerups: [], nextBombId: 1, winner: null, reason: null
  };
}

/** The last fighter standing wins; if the last fighters fall together the round is a draw. */
function resolveSurvivors(state: DuelState, reason: "blast" | "forfeit") {
  const survivors = state.players.flatMap((player, index) => player.alive ? [index as Seat] : []);
  if (survivors.length < 2) {
    state.winner = survivors[0] ?? "draw";
    state.reason = reason;
  }
}

/** Forfeits: the seats' fighters are out, and the round goes on while two fighters remain. */
export function eliminateSeats(state: DuelState, seats: Seat[]): DuelState {
  if (state.winner !== null || !seats.some((seat) => state.players[seat]?.alive)) return state;
  const next = structuredClone(state);
  for (const seat of seats) if (next.players[seat]) next.players[seat].alive = false;
  resolveSurvivors(next, "forfeit");
  return next;
}

/** Pure authoritative commands: time is supplied by advanceDuel, never by clients. */
export function commandDuel(state: DuelState, seat: Seat, command: DuelCommand): DuelState {
  if (state.winner !== null || state.time < state.startsAt || !state.players[seat].alive) return state;
  const player = state.players[seat];
  if (command.type === "bomb") {
    if (state.bombs.filter((bomb) => bomb.owner === seat).length >= player.loadout.bombs ||
      state.bombs.some((bomb) => tileListIncludes([bomb.tile], player.tile))) return state;
    return { ...state, nextBombId: state.nextBombId + 1, bombs: [...state.bombs, {
      id: state.nextBombId, owner: seat, tile: { ...player.tile }, range: player.loadout.blast,
      explodesAt: state.time + 1400
    }] };
  }
  if (state.time < player.nextMoveAt) return state;
  const delta = directionToDelta(command.direction);
  const tile = { x: player.tile.x + delta.x, y: player.tile.y + delta.y };
  if (!isWalkable(state.arena, tile) || state.bombs.some((bomb) => tileListIncludes([bomb.tile], tile)) ||
    state.players.some((other, index) => index !== seat && other.alive && tileListIncludes([other.tile], tile))) return state;
  const next = structuredClone(state);
  const actor = next.players[seat];
  actor.tile = tile;
  actor.nextMoveAt = next.time + 140 - (actor.loadout.speed - 1) * 20;
  const pickup = next.powerups.find((powerup) => tileListIncludes([powerup.tile], tile));
  if (pickup) {
    actor.loadout = applyPowerup(actor.loadout, pickup.type);
    next.powerups = next.powerups.filter((powerup) => powerup !== pickup);
  }
  return next;
}

/** Advances server elapsed time; resolves simultaneous and chained blasts before deciding a winner. */
export function advanceDuel(state: DuelState, time: number): DuelState {
  if (state.winner !== null || time < state.time) return state;
  const next = structuredClone(state);
  next.time = time;
  next.explosions = next.explosions.filter((blast) => blast.expiresAt > time);
  const queue = next.bombs.filter((bomb) => bomb.explodesAt <= time);
  const hitTiles: GridPoint[] = [];
  while (queue.length) {
    const bomb = queue.shift()!;
    if (!next.bombs.includes(bomb)) continue;
    next.bombs = next.bombs.filter((candidate) => candidate !== bomb);
    const blast = resolveBlast(next.arena, bomb.tile, bomb.range);
    hitTiles.push(...blast.tiles);
    next.explosions.push({
      id: bomb.id,
      tiles: blast.tiles,
      clearedBlocks: blast.clearedBlocks,
      expiresAt: time + 460
    });
    queue.push(...next.bombs.filter((candidate) => tileListIncludes(blast.tiles, candidate.tile)));
    for (const tile of blast.clearedBlocks) {
      const type = choosePowerupDrop(tile);
      if (type) next.powerups.push({ tile, type });
    }
  }
  for (const player of next.players) {
    if (tileListIncludes(hitTiles, player.tile)) player.alive = false;
  }
  resolveSurvivors(next, "blast");
  if (next.winner === null && time >= 183000) {
    next.winner = "draw";
    next.reason = "timeout";
  }
  return next;
}
