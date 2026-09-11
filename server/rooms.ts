import { advanceDuel, commandDuel, createDuel, type DuelState, type Seat } from "../src/game/simulation/duel";
import type { ClientMessage, RoomSnapshot } from "../src/game/multiplayer/protocol";
import type { JoinTicket } from "../src/lib/multiplayer-ticket";

export const RECONNECT_MS = 15000;
type Member = { id: string; name: string; connection: string | null; ready: boolean; disconnectedAt: number | null; sequence: number };
export type Room = { id: string; roundId: string; members: (Member | null)[]; duel: DuelState | null; startedAt: number; emptyAt: number | null };
export type DuelResult = { roundId: string; roomId: string; players: string[]; winnerId: string | null; reason: string; durationMs: number };

/** The process owns rooms; callers supply clock and IDs for deterministic tests. */
export class Rooms {
  readonly rooms = new Map<string, Room>();
  constructor(readonly serverId: string, private readonly newId: () => string, private readonly completed: (result: DuelResult) => void) {}

  join(ticket: JoinTicket, connection: string, now: number): { room: Room; seat: Seat } {
    let room = this.rooms.get(ticket.roomId);
    if (!room) {
      if (this.rooms.size >= 500) throw new Error("The arena is busy. Try again shortly.");
      room = { id: ticket.roomId, roundId: this.newId(), members: [null, null], duel: null, startedAt: 0, emptyAt: null };
      this.rooms.set(room.id, room);
    }
    this.tickRoom(room, now);
    const existing = room.members.findIndex((member) => member?.id === ticket.playerId);
    const active = room.duel && room.duel.winner === null;
    if (existing < 0 && active) throw new Error("A match is already in progress.");
    const seat = (existing >= 0 ? existing : room.members.findIndex((member) => !member)) as Seat;
    if (seat < 0) throw new Error("Match full. Two players are already in this lobby.");
    const member = room.members[seat];
    if (member?.connection) throw new Error("You already have a player slot open on another connection.");
    room.members[seat] = { id: ticket.playerId, name: ticket.name, connection, ready: false, disconnectedAt: null, sequence: -1 };
    room.emptyAt = null;
    // Rejoining a finished or waiting room clears both ready votes.
    if (!active) room.members.forEach((other) => { if (other) other.ready = false; });
    return { room, seat };
  }

  message(room: Room, seat: Seat, message: Exclude<ClientMessage, { type: "join" }>, now: number) {
    this.tickRoom(room, now);
    const member = room.members[seat];
    if (!member?.connection) return;
    if (message.type === "leave") { this.disconnect(room, seat, now, true); return; }
    if (message.type === "ready") {
      if (room.duel?.winner === null) return;
      member.ready = message.ready;
      if (room.members.every((other) => other?.connection && other.ready)) {
        room.duel = createDuel();
        room.startedAt = now;
        room.roundId = this.newId();
        room.members.forEach((other) => { if (other) { other.sequence = -1; other.ready = false; } });
      }
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
    if (room.duel?.winner === null && room.duel.time < room.duel.startsAt) room.duel = null;
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

  private tickRoom(room: Room, now: number) {
    const expired = room.members.map((member) => !!member && !member.connection && member.disconnectedAt !== null && now - member.disconnectedAt >= RECONNECT_MS);
    const wasLive = room.duel?.winner === null;
    if (room.duel && wasLive) {
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

  snapshot(room: Room, seat: Seat, now: number): RoomSnapshot {
    const disconnected = room.members.find((member) => member && !member.connection);
    return { type: "state", serverId: this.serverId, roundId: room.roundId, seat,
      phase: !room.duel ? "waiting" : room.duel.winner !== null ? "finished" : room.duel.time < room.duel.startsAt ? "countdown" : "playing",
      players: room.members.map((member) => member ? { name: member.name, ready: member.ready, connected: !!member.connection } : null),
      duel: room.duel,
      reconnectSeconds: disconnected?.disconnectedAt != null ? Math.max(0, Math.ceil((RECONNECT_MS - now + disconnected.disconnectedAt) / 1000)) : null };
  }
}
