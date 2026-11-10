import { advanceDuel, commandDuel, createDuel, eliminateSeats, type DuelRules, type DuelState, type Seat } from "../src/game/simulation/duel";
import { perkDropRatesFor } from "../src/game/simulation/perks";
import { createPartyBot, PARTY_SEAT_PROFILES, partyRoundSeed, stepPartyBots, type PartyBot } from "../src/game/simulation/partyBots";
import { createSeries, recordSeriesRound, seatSeriesOccupant, SERIES_TARGET_WINS, type SeriesState } from "../src/game/simulation/series";
import type { BotProfileId } from "../src/game/simulation/bots";
import type { ClientMessage, PartySnapshot, RoomSnapshot } from "../src/game/multiplayer/protocol";
import type { JoinTicket } from "../src/lib/multiplayer-ticket";

export const RECONNECT_MS = 15000;
/** Party Brawl always fields four fighters; bots fill the seats humans leave empty. */
export const PARTY_SEATS = 4;
/** A party round needs at least two people, so a round against bots alone never starts or counts. */
export const PARTY_MIN_HUMANS = 2;

export type RoomMode = "duel" | "party";
type Member = { id: string; name: string; connection: string | null; ready: boolean; disconnectedAt: number | null; sequence: number };
export type RoundSeat = { kind: "human"; playerId: string; name: string } | { kind: "bot"; profileId: BotProfileId };
/** Party-only round state. Bots have no connection and are never room members. */
export type PartyRound = { seats: RoundSeat[]; bots: PartyBot[]; seed: number };
export type Room = {
  id: string;
  mode: RoomMode;
  roundId: string;
  members: (Member | null)[];
  duel: DuelState | null;
  startedAt: number;
  emptyAt: number | null;
  party: PartyRound | null;
  /** Party-only: the best-of-three in progress or just finished. */
  series: { id: string; state: SeriesState } | null;
};
export type DuelResult = { roundId: string; roomId: string; players: string[]; winnerId: string | null; reason: string; durationMs: number };
export type PartyRoundResult = {
  kind: "round";
  roundId: string;
  roomId: string;
  seriesId: string;
  seriesRound: number;
  seats: RoundSeat[];
  winnerSeat: Seat | null;
  reason: string;
  durationMs: number;
};
export type PartySeriesResult = {
  kind: "series";
  seriesId: string;
  roomId: string;
  /** The final round's fighters, who hold the seats when the series ends. */
  seats: RoundSeat[];
  wins: number[];
  rounds: number;
  winnerSeat: Seat | null;
  reason: "won" | "cap";
};
export type PartyResult = PartyRoundResult | PartySeriesResult;

/** A duel room is keyed by its Activity instance; that instance's party lobby is a separate room. */
export function roomKey(instanceId: string, mode: RoomMode) {
  return mode === "party" ? `${instanceId}#party` : instanceId;
}

/** The process owns rooms; callers supply clock and IDs for deterministic tests. */
export class Rooms {
  readonly rooms = new Map<string, Room>();
  constructor(
    readonly serverId: string,
    private readonly newId: () => string,
    private readonly completed: (result: DuelResult) => void,
    private readonly maxRooms = 500,
    private readonly partyCompleted: (result: PartyResult) => void = () => undefined
  ) {
    if (!Number.isInteger(maxRooms) || maxRooms < 1) {
      throw new Error("maxRooms must be a positive integer");
    }
  }

  /** `replaced` names a still-live connection that the new one took the seat from. */
  join(ticket: JoinTicket, connection: string, now: number, mode: RoomMode = "duel"): { room: Room; seat: Seat; replaced: string | null } {
    const id = roomKey(ticket.roomId, mode);
    let room = this.rooms.get(id);
    if (!room) {
      if (this.rooms.size >= this.maxRooms) throw new Error("The arena is busy. Try again shortly.");
      const seats = mode === "party" ? PARTY_SEATS : 2;
      room = { id, mode, roundId: this.newId(), members: Array.from({ length: seats }, () => null), duel: null, startedAt: 0, emptyAt: null, party: null, series: null };
      this.rooms.set(room.id, room);
    }
    this.tickRoom(room, now);
    const existing = room.members.findIndex((member) => member?.id === ticket.playerId);
    const active = room.duel && room.duel.winner === null;
    if (existing < 0 && active) throw new Error("A match is already in progress.");
    const seat = (existing >= 0 ? existing : room.members.findIndex((member) => !member)) as Seat;
    if (seat < 0) {
      throw new Error(room.mode === "party" ? "Party full. Four players are already in this lobby." : "Match full. Two players are already in this lobby.");
    }
    // A fresh ticket is single-use and membership-verified, so it outranks an old
    // socket whose death the heartbeat has not detected yet (network switch, reload).
    const replaced = room.members[seat]?.connection ?? null;
    room.members[seat] = { id: ticket.playerId, name: ticket.name, connection, ready: false, disconnectedAt: null, sequence: -1 };
    room.emptyAt = null;
    // Rejoining a finished or waiting room clears both ready votes.
    if (!active) room.members.forEach((other) => { if (other) other.ready = false; });
    return { room, seat, replaced };
  }

  message(room: Room, seat: Seat, message: Exclude<ClientMessage, { type: "join" }>, now: number) {
    this.tickRoom(room, now);
    const member = room.members[seat];
    if (!member?.connection) return;
    if (message.type === "leave") { this.disconnect(room, seat, now, true); return; }
    if (message.type === "ready") {
      if (room.duel?.winner === null) return;
      member.ready = message.ready;
      if (this.everyoneReady(room)) this.startRound(room, now);
    } else if (room.duel && message.roundId === room.roundId && message.sequence > member.sequence) {
      member.sequence = message.sequence;
      room.duel = commandDuel(room.duel, seat, message.command);
    }
  }

  disconnect(room: Room, seat: Seat, now: number, leave = false) {
    const member = room.members[seat];
    if (!member) return;
    member.connection = null;
    member.ready = false;
    member.disconnectedAt = leave ? now - RECONNECT_MS : now;
    // Cancel a countdown if either player leaves before the match starts.
    if (room.duel?.winner === null && room.duel.time < room.duel.startsAt) { room.duel = null; room.party = null; }
    room.members.forEach((other) => { if (other) other.ready = false; });
    this.tickRoom(room, now);
  }

  tick(now: number) {
    for (const room of this.rooms.values()) {
      this.tickRoom(room, now);
      if (room.members.every((member) => !member)) {
        room.emptyAt ??= now;
        if (now - room.emptyAt > 60000) this.rooms.delete(room.id);
      }
    }
  }

  private everyoneReady(room: Room) {
    if (room.mode === "duel") return room.members.every((other) => other?.connection && other.ready);
    const humans = room.members.filter((other) => !!other);
    return humans.length >= PARTY_MIN_HUMANS && humans.every((other) => other.connection && other.ready);
  }

  private startRound(room: Room, now: number) {
    room.duel = createDuel(room.mode === "party" ? PARTY_SEATS : 2, roundRules(room.mode));
    room.startedAt = now;
    room.roundId = this.newId();
    room.members.forEach((other) => { if (other) { other.sequence = -1; other.ready = false; } });
    if (room.mode !== "party") return;
    // A finished series makes this a rematch; otherwise newcomers and departures take their seats now.
    if (!room.series || room.series.state.outcome) {
      room.series = { id: this.newId(), state: createSeries(room.members.map((_, seat) => occupantKey(room, seat as Seat))) };
    } else {
      for (const seat of room.members.keys()) {
        room.series.state = seatSeriesOccupant(room.series.state, seat as Seat, occupantKey(room, seat as Seat));
      }
    }
    const startsAt = room.duel.startsAt;
    const seats = room.members.map<RoundSeat>((member, index) => member
      ? { kind: "human", playerId: member.id, name: member.name }
      : { kind: "bot", profileId: createPartyBot(index as Seat, startsAt).profileId });
    room.party = {
      seats,
      bots: seats.flatMap((seat, index) => seat.kind === "bot" ? [createPartyBot(index as Seat, startsAt)] : []),
      seed: partyRoundSeed(room.roundId)
    };
  }

  private tickRoom(room: Room, now: number) {
    const expired = room.members.map((member) => !!member && !member.connection && member.disconnectedAt !== null && now - member.disconnectedAt >= RECONNECT_MS);
    const wasLive = room.duel?.winner === null;
    if (room.duel && wasLive && room.mode === "party") {
      this.tickParty(room, now, expired);
    } else if (room.duel && wasLive) {
      if (expired.some(Boolean)) {
        const connected = room.members.flatMap((member, index) => member?.connection ? [index as Seat] : []);
        room.duel = { ...room.duel, winner: connected.length === 1 ? connected[0] : "draw", reason: "forfeit" };
      } else {
        room.duel = advanceDuel(room.duel, now - room.startedAt);
      }
      if (room.duel.winner !== null) {
        const winner = room.duel.winner;
        this.completed({ roundId: room.roundId, roomId: room.id, players: room.members.map((member) => member?.id ?? ""),
          winnerId: winner === "draw" ? null : room.members[winner]?.id ?? null,
          reason: room.duel.reason!, durationMs: Math.max(0, room.duel.time - room.duel.startsAt) });
      }
    }
    expired.forEach((shouldRemove, index) => { if (shouldRemove) room.members[index] = null; });
  }

  /**
   * A forfeit knocks out only that fighter; the round runs on, bots included, until
   * one fighter is left or time runs out. With no person left in the room it is abandoned.
   */
  private tickParty(room: Room, now: number, expired: boolean[]) {
    const party = room.party;
    let duel = room.duel;
    if (!party || !duel) return;
    const isHuman = (seat: number) => party.seats[seat]?.kind === "human";
    const forfeits = expired.flatMap((gone, seat) => gone && isHuman(seat) ? [seat as Seat] : []);
    if (forfeits.length) duel = eliminateSeats(duel, forfeits);
    if (!room.members.some((member, seat) => member && !expired[seat])) {
      // Nobody is left to finish the series, so it ends unrecorded; its rounds stay.
      room.duel = { ...duel, winner: "draw", reason: "abandoned" };
      room.series = null;
      return;
    }
    if (duel.winner === null) {
      duel = advanceDuel(duel, now - room.startedAt);
      const stepped = stepPartyBots(duel, party.bots, party.seed);
      duel = stepped.state;
      party.bots = stepped.bots;
    }
    // A forfeit cannot hand the round to someone who is not here to claim it.
    if (duel.reason === "forfeit" && typeof duel.winner === "number" && isHuman(duel.winner) && !room.members[duel.winner]?.connection) {
      duel = { ...duel, winner: "draw" };
    }
    room.duel = duel;
    if (duel.winner === null || !room.series) return;
    const series = recordSeriesRound(room.series.state, duel.winner);
    room.series.state = series;
    this.partyCompleted({ kind: "round", roundId: room.roundId, roomId: room.id, seriesId: room.series.id, seriesRound: series.rounds,
      seats: party.seats, winnerSeat: duel.winner === "draw" ? null : duel.winner,
      reason: duel.reason!, durationMs: Math.max(0, duel.time - duel.startsAt) });
    if (series.outcome) {
      this.partyCompleted({ kind: "series", seriesId: room.series.id, roomId: room.id, seats: party.seats,
        wins: series.seats.map((seat) => seat?.wins ?? 0), rounds: series.rounds,
        winnerSeat: series.outcome.winnerSeat, reason: series.outcome.reason });
    }
  }

  snapshot(room: Room, seat: Seat, now: number): RoomSnapshot {
    const base = this.duelSnapshot(room, seat, now);
    return room.mode === "party" ? { ...base, ...partyView(room) } : base;
  }

  private duelSnapshot(room: Room, seat: Seat, now: number): RoomSnapshot {
    const disconnected = room.members.find((member) => member && !member.connection);
    return { type: "state", serverId: this.serverId, roundId: room.roundId, seat,
      phase: !room.duel ? "waiting" : room.duel.winner !== null ? "finished" : room.duel.time < room.duel.startsAt ? "countdown" : "playing",
      players: room.members.map((member) => member ? { name: member.name, ready: member.ready, connected: !!member.connection } : null),
      duel: room.duel,
      reconnectSeconds: disconnected?.disconnectedAt != null ? Math.max(0, Math.ceil((RECONNECT_MS - now + disconnected.disconnectedAt) / 1000)) : null };
  }
}

/** A mode with no perks gets no rules, so its rounds play exactly as they did before perks. */
export function roundRules(mode: RoomMode): DuelRules | undefined {
  const specials = perkDropRatesFor(mode);
  return specials ? { specials } : undefined;
}

/** Series wins follow whoever holds a seat: a person by account, an empty seat by its bot. */
function occupantKey(room: Room, seat: Seat) {
  const member = room.members[seat];
  return member ? `human:${member.id}` : `bot:${seat}`;
}

function partyView(room: Room): Omit<PartySnapshot, keyof RoomSnapshot> & { mode: "party" } {
  const series = room.series?.state ?? null;
  return {
    mode: "party",
    seats: room.members.map((member, seat) => member
      ? { kind: "human", name: member.name, connected: !!member.connection, ready: member.ready }
      : { kind: "bot", profileId: PARTY_SEAT_PROFILES[seat] }),
    fighters: room.party?.seats.map((fighter) => fighter.kind === "human"
      ? { kind: "human", name: fighter.name }
      : { kind: "bot", profileId: fighter.profileId }) ?? null,
    series: series && {
      rounds: series.rounds,
      target: SERIES_TARGET_WINS,
      // Until the next round seats a newcomer, show the record they will start with.
      wins: room.members.map((_, seat) => {
        const entry = series.seats[seat];
        return entry && (series.outcome || entry.occupant === occupantKey(room, seat as Seat)) ? entry.wins : 0;
      }),
      outcome: series.outcome
    }
  };
}
