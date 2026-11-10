import { describe, expect, it } from "vitest";
import { advanceDuel, commandDuel, createDuel, eliminateSeats } from "./duel";

describe("authoritative duel", () => {
  it("rejects movement before countdown, into walls, and faster than the cooldown", () => {
    const initial = createDuel();
    expect(commandDuel(initial, 0, { type: "move", direction: "right" })).toEqual(initial);
    const live = advanceDuel(initial, 3000);
    expect(commandDuel(live, 0, { type: "move", direction: "left" })).toEqual(live);
    const moved = commandDuel(live, 0, { type: "move", direction: "right" });
    expect(moved.players[0].tile).toEqual({ x: 2, y: 1 });
    expect(commandDuel(moved, 0, { type: "move", direction: "left" })).toEqual(moved);
    expect(initial.players[0].tile).toEqual({ x: 1, y: 1 });
  });

  it("enforces bomb capacity and server fuse timing", () => {
    const live = advanceDuel(createDuel(), 3000);
    const planted = commandDuel(live, 0, { type: "bomb" });
    expect(commandDuel(planted, 0, { type: "bomb" }).bombs).toHaveLength(1);
    expect(advanceDuel(planted, 4399).winner).toBeNull();
    expect(advanceDuel(planted, 4400).winner).toBe(1);
    expect(planted.bombs).toHaveLength(1);
  });

  it("resolves simultaneous deaths as a draw and freezes the finished round", () => {
    let state = advanceDuel(createDuel(), 3000);
    state = commandDuel(commandDuel(state, 0, { type: "bomb" }), 1, { type: "bomb" });
    const finished = advanceDuel(state, 4400);
    expect(finished.winner).toBe("draw");
    expect(commandDuel(finished, 0, { type: "move", direction: "right" })).toEqual(finished);
  });

  it("blocks occupied tiles, collects bounded powerups, and is deterministic", () => {
    const state = advanceDuel(createDuel(), 3000);
    state.players[1].tile = { x: 2, y: 1 };
    expect(commandDuel(state, 0, { type: "move", direction: "right" })).toEqual(state);
    state.players[1].tile = { x: 11, y: 9 };
    state.powerups.push({ tile: { x: 2, y: 1 }, type: "blast" });
    const move = { type: "move", direction: "right" } as const;
    expect(commandDuel(state, 0, move).players[0].loadout.blast).toBe(3);
    expect(commandDuel(state, 0, move)).toEqual(commandDuel(state, 0, move));
  });

  it("chains bombs and clears blocks using the shared blast rules", () => {
    const state = advanceDuel(createDuel(), 3000);
    state.bombs = [
      { id: 1, owner: 0, tile: { x: 1, y: 1 }, range: 2, explodesAt: 3100 },
      { id: 2, owner: 1, tile: { x: 2, y: 1 }, range: 2, explodesAt: 4500 }
    ];
    const next = advanceDuel(state, 3100);
    expect(next.bombs).toHaveLength(0);
    expect(next.explosions).toHaveLength(2);
    expect(next.explosions[0].clearedBlocks).toContainEqual({ x: 3, y: 1 });
    expect(next.arena[1][3]).toBe("floor");
  });
});

describe("party duel seats", () => {
  it("keeps the two-seat duel identical to the original spawn layout", () => {
    expect(createDuel()).toEqual(createDuel(2));
    expect(createDuel(2).players.map((player) => player.tile)).toEqual([{ x: 1, y: 1 }, { x: 11, y: 9 }]);
  });

  it("spawns three and four fighters in the cleared corners", () => {
    expect(createDuel(3).players.map((player) => player.tile)).toEqual([{ x: 1, y: 1 }, { x: 11, y: 9 }, { x: 11, y: 1 }]);
    const four = createDuel(4);
    expect(four.players.map((player) => player.tile)).toEqual([{ x: 1, y: 1 }, { x: 11, y: 9 }, { x: 11, y: 1 }, { x: 1, y: 9 }]);
    for (const player of four.players) expect(four.arena[player.tile.y][player.tile.x]).toBe("floor");
  });

  it("keeps a three-fighter round going until one fighter is left standing", () => {
    let state = advanceDuel(createDuel(3), 3000);
    state = commandDuel(state, 0, { type: "bomb" });
    state = advanceDuel(state, 4400);
    expect(state.players.map((player) => player.alive)).toEqual([false, true, true]);
    expect(state.winner).toBeNull();
    state = commandDuel(state, 1, { type: "bomb" });
    state = advanceDuel(state, 5800);
    expect(state.winner).toBe(2);
    expect(state.reason).toBe("blast");
  });

  it("draws when the last fighters fall on the same tick", () => {
    let state = advanceDuel(createDuel(3), 3000);
    for (const seat of [0, 1, 2] as const) state = commandDuel(state, seat, { type: "bomb" });
    const finished = advanceDuel(state, 4400);
    expect(finished.winner).toBe("draw");
  });

  it("blocks moves into any living fighter's tile with four seats", () => {
    const state = advanceDuel(createDuel(4), 3000);
    state.players[3].tile = { x: 2, y: 1 };
    expect(commandDuel(state, 0, { type: "move", direction: "right" })).toEqual(state);
    state.players[3].alive = false;
    expect(commandDuel(state, 0, { type: "move", direction: "right" }).players[0].tile).toEqual({ x: 2, y: 1 });
  });

  it("eliminates forfeiting seats and lets the round continue while two remain", () => {
    const live = advanceDuel(createDuel(4), 3000);
    const one = eliminateSeats(live, [1]);
    expect(one.players[1].alive).toBe(false);
    expect(one.winner).toBeNull();
    expect(live.players[1].alive).toBe(true);
    const done = eliminateSeats(one, [0, 3]);
    expect(done).toMatchObject({ winner: 2, reason: "forfeit" });
    expect(eliminateSeats(done, [2])).toBe(done);
    expect(eliminateSeats(live, [0, 1, 2, 3])).toMatchObject({ winner: "draw", reason: "forfeit" });
  });
});

describe("duel rules", () => {
  /** Breaks every soft block at once and reports what dropped. */
  function dropsWith(state: ReturnType<typeof createDuel>) {
    const live = advanceDuel(state, 3000);
    live.bombs = live.arena.flatMap((row, y) => row.flatMap((cell, x) =>
      cell === "soft" ? [{ id: 100 + y * 20 + x, owner: 0 as const, tile: { x: x - 1, y }, range: 1, explodesAt: 3000 }] : []));
    return advanceDuel(live, 3050).powerups.map((powerup) => powerup.type);
  }

  it("plays the classic game when a round has no rules", () => {
    expect(createDuel(4)).not.toHaveProperty("rules");
    expect(dropsWith(createDuel(4)).every((type) => ["bomb", "blast", "speed"].includes(type))).toBe(true);
  });

  it("drops the perks a room switches on, and no others", () => {
    const visionOnly = dropsWith(createDuel(4, { specials: { vision: 3 } }));
    expect(visionOnly).toContain("vision");
    expect(visionOnly.some((type) => type === "shield" || type === "kick" || type === "remote")).toBe(false);
    const classic = dropsWith(createDuel(4)).filter((type) => ["bomb", "blast", "speed"].includes(type));
    expect(visionOnly.filter((type) => ["bomb", "blast", "speed"].includes(type))).toEqual(classic);
  });

  it("lets a fighter pick up a perk once", () => {
    const state = advanceDuel(createDuel(2, { specials: { shield: 3 } }), 3000);
    state.powerups.push({ tile: { x: 2, y: 1 }, type: "shield" });
    const picked = commandDuel(state, 0, { type: "move", direction: "right" });
    expect(picked.players[0].loadout.shield).toBe(1);
    expect(picked.powerups).toHaveLength(0);
  });
});

describe("shield in the duel", () => {
  it("lets a shielded fighter survive one blast, a whole chain included", () => {
    const state = advanceDuel(createDuel(2, { specials: { shield: 3 } }), 3000);
    state.players[0].loadout.shield = 1;
    state.bombs = [
      { id: 1, owner: 0, tile: { x: 1, y: 1 }, range: 2, explodesAt: 3100 },
      { id: 2, owner: 1, tile: { x: 2, y: 1 }, range: 2, explodesAt: 4500 }
    ];
    const next = advanceDuel(state, 3100);
    expect(next.players[0]).toMatchObject({ alive: true, guardUntil: 4100 });
    expect(next.players[0].loadout.shield).toBe(0);
    expect(next.winner).toBeNull();
  });

  it("protects during the grace and knocks out after it", () => {
    let state = advanceDuel(createDuel(2, { specials: { shield: 3 } }), 3000);
    state.players[0].loadout.shield = 1;
    state = commandDuel(state, 0, { type: "bomb" });
    state = advanceDuel(state, 4400);
    expect(state.players[0].alive).toBe(true);
    state.bombs.push({ id: 9, owner: 1, tile: { x: 1, y: 2 }, range: 1, explodesAt: 5000 });
    state = advanceDuel(state, 5000);
    expect(state.players[0].alive).toBe(true);
    state.bombs.push({ id: 10, owner: 1, tile: { x: 1, y: 2 }, range: 1, explodesAt: 5400 });
    state = advanceDuel(state, 5400);
    expect(state.players[0].alive).toBe(false);
    expect(state.winner).toBe(1);
  });
});
