import { describe, expect, it } from "vitest";
import { Rooms, type DuelResult, type PartyResult, type Room } from "./rooms";
import type { Seat } from "../src/game/simulation/duel";
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
    expect(() => rooms.join(ticket("c"), "third", 0)).toThrow("full");
    rooms.message(a.room, 0, { type: "ready", ready: true }, 0);
    expect(a.room.duel).toBeNull();
    rooms.message(a.room, 1, { type: "ready", ready: true }, 0);
    expect(rooms.snapshot(a.room, 0, 0).phase).toBe("countdown");
    rooms.tick(3000);
    expect(rooms.snapshot(a.room, 1, 3000).phase).toBe("playing");
  });

  it("routes a detonate input to the fighter's remote bomb", () => {
    const { rooms, a, ready } = setup(); ready(); rooms.tick(3000);
    a.room.duel!.players[0].loadout.remote = 1;
    const input = (sequence: number, command: { type: "bomb" } | { type: "detonate" }) =>
      ({ type: "input", roundId: a.room.roundId, sequence, command }) as const;
    rooms.message(a.room, 0, input(1, { type: "bomb" }), 3000);
    expect(a.room.duel?.bombs[0]).toMatchObject({ remote: true, explodesAt: 7000 });
    rooms.message(a.room, 0, input(2, { type: "detonate" }), 3400);
    rooms.tick(3450);
    expect(a.room.duel?.bombs).toHaveLength(0);
    expect(a.room.duel?.explosions).toHaveLength(1);
  });

  it("plays the two-seat duel without shield, kick or remote", () => {
    const { rooms, a, ready } = setup(); ready(); rooms.tick(3000);
    const specials = a.room.duel?.rules?.specials ?? {};
    expect([specials.shield ?? 0, specials.kick ?? 0, specials.remote ?? 0]).toEqual([0, 0, 0]);
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
  it("hands a live seat to a newer connection mid-match without a forfeit", () => {
    const { rooms, a, ready, ticket, results } = setup(); ready(); rooms.tick(3000);
    expect(a.replaced).toBeNull();
    const takeover = rooms.join(ticket("a"), "replacement", 3100);
    expect(takeover).toMatchObject({ seat: 0, replaced: "connection-a" });
    expect(a.room.members[0]?.connection).toBe("replacement");
    expect(rooms.snapshot(a.room, 0, 3100)).toMatchObject({ phase: "playing", reconnectSeconds: null });
    rooms.tick(30000);
    expect(a.room.duel?.winner).toBeNull();
    expect(results).toHaveLength(0);
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

describe("party rooms", () => {
  function party() {
    let id = 0;
    const results: PartyResult[] = [];
    const duels: DuelResult[] = [];
    const rooms = new Rooms("server", () => `round-${++id}`, (result) => duels.push(result), 500, (result) => results.push(result));
    const ticket = (playerId: string): JoinTicket => ({ playerId, name: playerId, roomId: "instance", expiresAt: 30000, nonce: "unused" });
    const join = (playerId: string, now = 0) => rooms.join(ticket(playerId), `connection-${playerId}`, now, "party");
    const readyAll = (room: Room, now = 0) => room.members.forEach((member, seat) => {
      if (member?.connection) rooms.message(room, seat as Seat, { type: "ready", ready: true }, now);
    });
    return { rooms, results, duels, ticket, join, readyAll };
  }

  it("keeps the party lobby apart from the instance's duel and seats four people", () => {
    const { rooms, join, ticket } = party();
    const a = join("a");
    expect(a.room.id).toBe("instance#party");
    expect(a.room.members).toHaveLength(4);
    expect(rooms.join(ticket("a"), "duel-a", 0).room.id).toBe("instance");
    for (const id of ["b", "c", "d"]) join(id);
    expect(() => join("e")).toThrow("Party full");
  });

  it("needs two people ready and fills every empty seat with a bot", () => {
    const { join, readyAll, rooms } = party();
    const { room } = join("a");
    readyAll(room);
    expect(room.duel).toBeNull();
    join("b");
    readyAll(room);
    expect(rooms.snapshot(room, 0, 0).phase).toBe("countdown");
    expect(room.duel?.players).toHaveLength(4);
    expect(room.party?.seats).toEqual([
      { kind: "human", playerId: "a", name: "a" },
      { kind: "human", playerId: "b", name: "b" },
      { kind: "bot", profileId: "volt-warden" },
      { kind: "bot", profileId: "glitch-bloom" }
    ]);
    expect(room.party?.bots.map((bot) => bot.seat)).toEqual([2, 3]);
    expect(room.duel?.rules?.specials?.shield).toBeGreaterThan(0);
  });

  it("gives a newcomer the lowest open seat while the lobby waits, and refuses joins mid-round", () => {
    const { join, readyAll, rooms } = party();
    const { room } = join("a");
    join("b");
    rooms.message(room, 1, { type: "leave" }, 0);
    expect(join("c", 10).seat).toBe(1);
    readyAll(room, 10);
    expect(() => join("d", 20)).toThrow("in progress");
  });

  it("lets bots play their seats on the server clock", () => {
    const { join, readyAll, rooms } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    for (let now = 0; now <= 6000; now += 50) rooms.tick(now);
    expect(room.party?.bots.every((bot) => bot.turn > 0)).toBe(true);
  });

  it("knocks out a forfeiting person and keeps the round going for everyone else", () => {
    const { join, readyAll, rooms, results } = party();
    const { room } = join("a");
    join("b");
    join("c");
    readyAll(room);
    rooms.tick(3000);
    rooms.message(room, 2, { type: "leave" }, 3100);
    expect(room.duel?.players[2].alive).toBe(false);
    expect(room.duel?.winner).toBeNull();
    expect(room.members[2]).toBeNull();
    expect(results).toHaveLength(0);
  });

  it("lets the bots finish the round after every person is out, then reports it once", () => {
    const { join, readyAll, rooms, results } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    rooms.tick(3000);
    rooms.message(room, 0, { type: "input", roundId: room.roundId, sequence: 0, command: { type: "bomb" } }, 3000);
    rooms.message(room, 1, { type: "input", roundId: room.roundId, sequence: 0, command: { type: "bomb" } }, 3000);
    rooms.tick(4400);
    expect(room.duel?.players.slice(0, 2).map((player) => player.alive)).toEqual([false, false]);
    expect(room.duel?.winner).toBeNull();
    for (let now = 4400; room.duel?.winner === null; now += 50) rooms.tick(now);
    rooms.tick(200_000);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: "round", roundId: room.roundId, roomId: "instance#party", seriesRound: 1 });
    expect(results[0].seats.filter((seat) => seat.kind === "human")).toHaveLength(2);
    expect(results[0].winnerSeat === null || results[0].winnerSeat >= 2).toBe(true);
  });

  it("abandons a round nobody is left to watch and reports nothing", () => {
    const { join, readyAll, rooms, results } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    rooms.tick(3000);
    rooms.message(room, 0, { type: "leave" }, 3100);
    rooms.message(room, 1, { type: "leave" }, 3100);
    expect(room.duel).toMatchObject({ winner: "draw", reason: "abandoned" });
    expect(results).toHaveLength(0);
  });

  it("hands a party seat to a newer connection without a forfeit", () => {
    const { join, readyAll, rooms, ticket, results } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    rooms.tick(3000);
    expect(rooms.join(ticket("b"), "replacement", 3100, "party")).toMatchObject({ seat: 1, replaced: "connection-b" });
    rooms.tick(30000);
    expect(room.duel?.players[1].alive).toBe(true);
    expect(results.every((result) => result.reason !== "forfeit")).toBe(true);
  });

  it("does not let a forfeit hand the round to someone who is reconnecting", () => {
    const { join, readyAll, rooms, results } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    rooms.tick(3000);
    room.duel!.players[2].alive = false;
    room.duel!.players[3].alive = false;
    rooms.disconnect(room, 1, 3100);
    rooms.message(room, 0, { type: "leave" }, 3200);
    expect(room.duel).toMatchObject({ winner: "draw", reason: "forfeit" });
    expect(results.at(-1)).toMatchObject({ winnerSeat: null, reason: "forfeit" });
  });

  /** Plays a round in which only `survivor` is left standing; the next tick resolves it. */
  function winRound(rooms: Rooms, room: Room, survivor: Seat, now: number) {
    rooms.tick(now + 3000);
    room.duel = { ...room.duel!, players: room.duel!.players.map((player, seat) => ({ ...player, alive: seat === survivor })) };
    rooms.tick(now + 3050);
  }

  it("needs fresh votes between rounds and finishes a best-of-three", () => {
    const { join, readyAll, rooms, results } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    winRound(rooms, room, 0, 0);
    expect(rooms.snapshot(room, 0, 4400)).toMatchObject({ mode: "party", phase: "finished",
      series: { rounds: 1, target: 2, wins: [1, 0, 0, 0], outcome: null } });
    rooms.message(room, 0, { type: "ready", ready: true }, 5000);
    expect(rooms.snapshot(room, 0, 5000).phase).toBe("finished");
    rooms.message(room, 1, { type: "ready", ready: true }, 5000);
    expect(rooms.snapshot(room, 0, 5000).phase).toBe("countdown");
    winRound(rooms, room, 0, 5000);
    const rounds = results.filter((result) => result.kind === "round");
    const series = results.filter((result) => result.kind === "series");
    expect(rounds.map((round) => round.seriesRound)).toEqual([1, 2]);
    expect(new Set(rounds.map((round) => round.seriesId)).size).toBe(1);
    expect(series).toEqual([expect.objectContaining({ seriesId: rounds[0].seriesId, wins: [2, 0, 0, 0], rounds: 2, winnerSeat: 0, reason: "won" })]);
    readyAll(room, 10_000);
    winRound(rooms, room, 1, 10_000);
    const rematch = results.filter((result) => result.kind === "round").at(-1);
    expect(rematch).toMatchObject({ seriesRound: 1 });
    expect(rematch?.kind === "round" && rematch.seriesId).not.toBe(rounds[0].seriesId);
  });

  it("seats a newcomer in a bot's seat between rounds with a fresh record", () => {
    const { join, readyAll, rooms, results } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    winRound(rooms, room, 3, 0);
    expect(results.at(-1)).toMatchObject({ kind: "round", winnerSeat: 3 });
    expect(rooms.snapshot(room, 0, 3050)).toMatchObject({ series: { wins: [0, 0, 0, 1] } });
    const newcomer = join("c", 4000);
    expect(newcomer.seat).toBe(2);
    expect(rooms.snapshot(room, 0, 4000)).toMatchObject({ seats: [{ kind: "human" }, { kind: "human" }, { kind: "human", name: "c" }, { kind: "bot", profileId: "glitch-bloom" }] });
    rooms.message(room, 1, { type: "leave" }, 4000);
    expect(rooms.snapshot(room, 0, 4000)).toMatchObject({ seats: [{ kind: "human" }, { kind: "bot", profileId: "fuse-rush" }, { kind: "human" }, { kind: "bot" }] });
    readyAll(room, 4100);
    expect(room.party?.seats.map((seat) => seat.kind)).toEqual(["human", "bot", "human", "bot"]);
    expect(room.series?.state.seats.map((seat) => seat?.occupant)).toEqual(["human:a", "bot:1", "human:c", "bot:3"]);
    expect(room.series?.state.seats[3]?.wins).toBe(1);
  });

  it("drops an abandoned series so the next round starts a new one", () => {
    const { join, readyAll, rooms } = party();
    const { room } = join("a");
    join("b");
    readyAll(room);
    const first = room.series?.id;
    rooms.tick(3000);
    rooms.message(room, 0, { type: "leave" }, 3100);
    rooms.message(room, 1, { type: "leave" }, 3100);
    expect(room.series).toBeNull();
    join("a", 4000);
    join("b", 4000);
    readyAll(room, 4000);
    expect(room.series?.id).not.toBe(first);
  });

  it("keeps the duel snapshot free of party fields", () => {
    const { rooms, ticket } = party();
    const duel = rooms.join(ticket("a"), "duel-a", 0);
    expect(rooms.snapshot(duel.room, 0, 0)).not.toHaveProperty("mode");
  });
});
