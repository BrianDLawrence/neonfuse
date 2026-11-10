import { createInitialArena, directionToDelta, getSpawnPoints, isWalkable, type ArenaGrid, type Direction, type GridPoint } from "./arena";
import { resolveBlast, tileListIncludes } from "./blast";
import { stepSlides, tryKick, type BombSlide } from "./kick";
import { resolveShieldHit } from "./shield";
import { applyPowerup, choosePowerupDrop, createInitialLoadout, DEFAULT_POWERUP_DROP_RATES, type ActorLoadout, type PickupType, type SpecialDropRates } from "./powerups";

export type Seat = 0 | 1 | 2 | 3;
export type SeatCount = 2 | 3 | 4;
export type DuelCommand = { type: "move"; direction: Direction } | { type: "bomb" };
/**
 * Per-room rules the server picks when a round starts. A state without rules plays the
 * classic game, which is what the two-seat duel did before perks existed.
 */
export type DuelRules = {
  /** Perks that can drop from broken blocks; null drops none. */
  specials: SpecialDropRates | null;
};
export type DuelState = {
  time: number;
  startsAt: number;
  arena: ArenaGrid;
  players: {
    tile: GridPoint;
    alive: boolean;
    loadout: ActorLoadout;
    nextMoveAt: number;
    /** Set when a shield breaks: blasts can't hurt this fighter before this time. */
    guardUntil?: number;
  }[];
  bombs: {
    id: number;
    owner: Seat;
    tile: GridPoint;
    range: number;
    explodesAt: number;
    /** Set while a kicked bomb is sliding. */
    slide?: BombSlide;
  }[];
  explosions: { id: number; tiles: GridPoint[]; clearedBlocks: GridPoint[]; expiresAt: number }[];
  powerups: { tile: GridPoint; type: PickupType }[];
  nextBombId: number;
  winner: Seat | "draw" | null;
  reason: "blast" | "forfeit" | "timeout" | "abandoned" | null;
  /** Absent on a classic round and in snapshots from servers that predate perks. */
  rules?: DuelRules;
};

/** Two seats is the friend duel; three or four take the remaining corners in `getSpawnPoints` order. */
export function createDuel(seats: SeatCount = 2, rules?: DuelRules): DuelState {
  const arena = createInitialArena();
  return {
    ...(rules ? { rules } : {}),
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

function livingTiles(state: DuelState) {
  return state.players.filter((player) => player.alive).map((player) => player.tile);
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
  const cooldown = 140 - (player.loadout.speed - 1) * 20;
  // Walking into a bomb with Kick sends it sliding; the kicker stays put and spends the step.
  const kick = (player.loadout.kick ?? 0) >= 1 && state.bombs.some((bomb) => tileListIncludes([bomb.tile], tile))
    ? tryKick({ arena: state.arena, bombs: state.bombs, fighters: livingTiles(state) }, player.tile, command.direction, state.time)
    : null;
  if (kick) {
    const next = structuredClone(state);
    next.bombs.find((bomb) => bomb.id === kick.bombId)!.slide = kick.slide;
    next.players[seat].nextMoveAt = next.time + cooldown;
    return next;
  }
  if (!isWalkable(state.arena, tile) || state.bombs.some((bomb) => tileListIncludes([bomb.tile], tile)) ||
    state.players.some((other, index) => index !== seat && other.alive && tileListIncludes([other.tile], tile))) return state;
  const next = structuredClone(state);
  const actor = next.players[seat];
  actor.tile = tile;
  actor.nextMoveAt = next.time + cooldown;
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
  // Kicked bombs slide before anything explodes, so a bomb blows up where it has got to.
  if (next.bombs.some((bomb) => bomb.slide)) next.bombs = stepSlides({ arena: next.arena, fighters: livingTiles(next) }, next.bombs, time);
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
      const type = choosePowerupDrop(tile, DEFAULT_POWERUP_DROP_RATES, next.rules?.specials ?? null);
      if (type) next.powerups.push({ tile, type });
    }
  }
  // Every blast of this tick counts as one hit, so one shield covers a whole chain.
  for (const player of next.players) {
    if (!tileListIncludes(hitTiles, player.tile)) continue;
    const hit = resolveShieldHit({ alive: player.alive, shield: player.loadout.shield ?? 0, guardUntil: player.guardUntil ?? 0 }, time);
    player.alive = hit.alive;
    if (hit.absorbed) {
      player.loadout.shield = hit.shield;
      player.guardUntil = hit.guardUntil;
    }
  }
  resolveSurvivors(next, "blast");
  if (next.winner === null && time >= 183000) {
    next.winner = "draw";
    next.reason = "timeout";
  }
  return next;
}
