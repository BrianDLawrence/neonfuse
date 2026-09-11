import { describe, expect, it } from "vitest";
import { advanceDuel, commandDuel, createDuel } from "./duel";

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
    expect(next.arena[1][3]).toBe("floor");
  });
});
