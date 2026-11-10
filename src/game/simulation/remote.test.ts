import { describe, expect, it } from "vitest";
import type { ArenaGrid } from "./arena";
import {
  chainBlastTiles,
  chooseBotDetonation,
  chooseDetonation,
  isRemoteArmed,
  plantFuseMs,
  REMOTE_ARM_MS,
  REMOTE_FUSE_MS,
  type RemoteBomb
} from "./remote";

const arena: ArenaGrid = [
  ["hard", "hard", "hard", "hard", "hard", "hard", "hard", "hard"],
  ["hard", "floor", "floor", "floor", "floor", "floor", "floor", "hard"],
  ["hard", "hard", "hard", "hard", "hard", "hard", "hard", "hard"]
];

const bomb = (id: number, x: number, plantedAt: number, extra: Partial<RemoteBomb> = {}): RemoteBomb => ({
  id, owner: 0, tile: { x, y: 1 }, range: 1, remote: true, plantedAt, ...extra
});

describe("remote fuses", () => {
  it("gives a remote holder's bombs the long fuse", () => {
    expect(plantFuseMs(true, 1400)).toBe(REMOTE_FUSE_MS);
    expect(plantFuseMs(false, 1400)).toBe(1400);
  });

  it("arms a remote bomb a moment after it is planted", () => {
    expect(isRemoteArmed(bomb(1, 1, 1000), 1000 + REMOTE_ARM_MS - 1)).toBe(false);
    expect(isRemoteArmed(bomb(1, 1, 1000), 1000 + REMOTE_ARM_MS)).toBe(true);
    expect(isRemoteArmed(bomb(1, 1, 1000, { remote: false }), 5000)).toBe(false);
  });
});

describe("chooseDetonation", () => {
  it("sets off the owner's oldest armed remote bomb", () => {
    const bombs = [bomb(3, 5, 2000), bomb(2, 3, 1000), bomb(4, 1, 900, { owner: 1 })];
    expect(chooseDetonation(bombs, 0, 3000)).toBe(2);
  });

  it("skips bombs that are not armed yet or not remote", () => {
    expect(chooseDetonation([bomb(1, 1, 1000)], 0, 1100)).toBeNull();
    expect(chooseDetonation([bomb(1, 1, 0, { remote: false })], 0, 5000)).toBeNull();
    expect(chooseDetonation([], 0, 5000)).toBeNull();
  });
});

describe("chainBlastTiles", () => {
  it("follows the bombs a blast would set off", () => {
    const tiles = chainBlastTiles(arena, [bomb(1, 1, 0), bomb(2, 2, 0, { owner: 1, remote: false })], 1);
    expect(tiles).toContainEqual({ x: 3, y: 1 });
    expect(tiles).not.toContainEqual({ x: 4, y: 1 });
  });
});

describe("chooseBotDetonation", () => {
  const base = { arena, owner: 0, holdMs: 1400 } as const;

  it("detonates when a rival is in the blast and the bot is clear", () => {
    expect(chooseBotDetonation({ ...base, actorTile: { x: 5, y: 1 }, rivals: [{ x: 2, y: 1 }], bombs: [bomb(1, 1, 0)], time: 500 })).toBe(1);
  });

  it("never detonates on itself, even through a chain", () => {
    const bombs = [bomb(1, 1, 0), bomb(2, 2, 0, { owner: 1, remote: false })];
    expect(chooseBotDetonation({ ...base, actorTile: { x: 3, y: 1 }, rivals: [{ x: 1, y: 1 }], bombs, time: 5000 })).toBeNull();
  });

  it("detonates after the bot's normal fuse even with no rival near", () => {
    const options = { ...base, actorTile: { x: 6, y: 1 }, rivals: [], bombs: [bomb(1, 1, 0)] };
    expect(chooseBotDetonation({ ...options, time: 1399 })).toBeNull();
    expect(chooseBotDetonation({ ...options, time: 1400 })).toBe(1);
  });
});
