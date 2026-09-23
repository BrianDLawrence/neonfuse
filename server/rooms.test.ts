import { describe, expect, it } from "vitest";
import { Rooms, type DuelResult } from "./rooms";
import type { JoinTicket } from "../src/lib/multiplayer-ticket";

function setup() {
  let id = 0;
  const results: DuelResult[] = [];
  const rooms = new Rooms("server", () => `round-${++id}`, (result) => results.push(result));
  const ticket = (playerId: string): JoinTicket => ({ playerId, name: playerId, roomId: "party", expiresAt: 30000, nonce: "unused" });
  const a = rooms.join(ticket("a"), "connection-a", 0);
  const b = rooms.join(ticket("b"), "connection-b", 0);
  const ready = () => { rooms.message(a.room, 0, { type: "ready", ready: true }, 0); rooms.message(a.room, 1, { type: "ready", ready: true }, 0); };
  return { rooms, results, ticket, a, b, ready };
}

describe("two-player rooms", () => {
  it("enforces the configured per-process room ceiling", () => {
    const rooms = new Rooms("server", () => "round", () => undefined, 1);
    const ticket = (roomId: string): JoinTicket => ({
      playerId: roomId,
      name: roomId,
      roomId,
      expiresAt: 30000,
      nonce: roomId
    });

    rooms.join(ticket("first"), "connection-first", 0);
    expect(() => rooms.join(ticket("second"), "connection-second", 0)).toThrow("busy");
  });

  it("reserves exactly two distinct accounts and starts only with both ready", () => {
    const { rooms, ticket, a } = setup();
    expect(() => rooms.join(ticket("a"), "duplicate", 0)).toThrow("already");
    expect(() => rooms.join(ticket("c"), "third", 0)).toThrow("full");
    rooms.message(a.room, 0, { type: "ready", ready: true }, 0);
    expect(a.room.duel).toBeNull();
    rooms.message(a.room, 1, { type: "ready", ready: true }, 0);
    expect(rooms.snapshot(a.room, 0, 0).phase).toBe("countdown");
    rooms.tick(3000);
    expect(rooms.snapshot(a.room, 1, 3000).phase).toBe("playing");
  });
  it("rejects stale/duplicate inputs and inputs from the previous round", () => {
    const { rooms, a, ready } = setup(); ready(); rooms.tick(3000);
    const input = { type: "input", roundId: a.room.roundId, sequence: 1, command: { type: "move", direction: "right" } } as const;
    rooms.message(a.room, 0, input, 3000);
    rooms.message(a.room, 0, { ...input, command: { type: "move", direction: "left" } }, 3300);
    expect(a.room.duel?.players[0].tile).toEqual({ x: 2, y: 1 });
    rooms.message(a.room, 0, { ...input, roundId: "old", sequence: 2 }, 3400);
    expect(a.room.duel?.players[0].tile).toEqual({ x: 2, y: 1 });
  });
  it("restores a disconnected seat, prevents mid-match joins, and records a forfeit once", () => {
    const { rooms, a, ready, ticket, results } = setup(); ready(); rooms.tick(3000);
    rooms.disconnect(a.room, 0, 3100);
    expect(() => rooms.join(ticket("c"), "c", 3200)).toThrow("progress");
    expect(rooms.join(ticket("a"), "reconnected", 3200).seat).toBe(0);
    rooms.disconnect(a.room, 0, 3300);
    rooms.tick(18300); rooms.tick(19000);
    expect(a.room.duel?.winner).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0].winnerId).toBe("b");
  });
  it("cancels countdown on disconnect and needs fresh ready votes", () => {
    const { rooms, a, ready, ticket } = setup(); ready();
    rooms.disconnect(a.room, 0, 1000);
    rooms.join(ticket("a"), "again", 1200);
    expect(a.room.duel).toBeNull();
    expect(a.room.members.every((member) => !member?.ready)).toBe(true);
  });
  it("supports mutual rematches and isolates unrelated parties", () => {
    const { rooms, a, ready, ticket } = setup(); ready(); rooms.tick(3000);
    const oldRound = a.room.roundId;
    rooms.message(a.room, 0, { type: "input", roundId: oldRound, sequence: 0, command: { type: "bomb" } }, 3000);
    rooms.tick(4400);
    rooms.message(a.room, 0, { type: "ready", ready: true }, 4500);
    expect(a.room.roundId).toBe(oldRound);
    rooms.message(a.room, 1, { type: "ready", ready: true }, 4500);
    expect(a.room.roundId).not.toBe(oldRound);
    expect(rooms.join({ ...ticket("a"), roomId: "other-party" }, "other", 0).room.duel).toBeNull();
  });
});
