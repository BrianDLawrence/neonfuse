import { describe, expect, it } from "vitest";
import { createInitialArena, type ArenaGrid } from "./arena";
import { BOT_PROFILES, chooseBotTurn, type BotActorState } from "./bots";
import { createInitialLoadout } from "./powerups";

function makeArena(): ArenaGrid {
  return [
    ["hard", "hard", "hard", "hard", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "hard", "hard", "hard", "hard"]
  ];
}

function makeSoftArena(): ArenaGrid {
  return [
    ["hard", "hard", "hard", "hard", "hard"],
    ["hard", "floor", "soft", "floor", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "floor", "floor", "floor", "hard"],
    ["hard", "hard", "hard", "hard", "hard"]
  ];
}

function makeBoxedArena(): ArenaGrid {
  return [
    ["hard", "hard", "hard"],
    ["hard", "floor", "hard"],
    ["hard", "hard", "hard"]
  ];
}

function makeBot(overrides: Partial<BotActorState> = {}): BotActorState {
  return {
    id: "bot-a",
    tile: { x: 1, y: 1 },
    alive: true,
    loadout: createInitialLoadout(),
    profile: BOT_PROFILES["bot-a"],
    ...overrides
  };
}

describe("chooseBotTurn", () => {
  it("flees blast danger first", () => {
    const intent = chooseBotTurn({
      arena: makeArena(),
      actor: makeBot({ tile: { x: 2, y: 2 } }),
      opponentTile: { x: 3, y: 3 },
      bombs: [{ tile: { x: 2, y: 2 }, range: 2 }],
      activeBombCount: 0,
      blockedTiles: [{ x: 2, y: 2 }]
    });

    expect(intent).toEqual({ type: "move", tile: { x: 3, y: 2 } });
  });

  it("waits when safe while bombs are active", () => {
    const intent = chooseBotTurn({
      arena: makeArena(),
      actor: makeBot(),
      opponentTile: { x: 3, y: 3 },
      bombs: [{ tile: { x: 3, y: 3 }, range: 1 }],
      activeBombCount: 0
    });

    expect(intent).toEqual({ type: "wait" });
  });

  it("refuses to plant a bomb without an escape route", () => {
    const intent = chooseBotTurn({
      arena: makeBoxedArena(),
      actor: makeBot({ tile: { x: 1, y: 1 } }),
      opponentTile: { x: 1, y: 1 },
      bombs: [],
      activeBombCount: 0
    });

    expect(intent).toEqual({ type: "wait" });
  });

  it("plants when a soft block opportunity has an escape route", () => {
    const intent = chooseBotTurn({
      arena: makeSoftArena(),
      actor: makeBot(),
      opponentTile: { x: 3, y: 3 },
      bombs: [],
      activeBombCount: 0
    });

    expect(intent).toEqual({ type: "plant-bomb", moveTo: { x: 1, y: 2 } });
  });

  it("moves toward an occupied opponent tile without needing to enter it", () => {
    const intent = chooseBotTurn({
      arena: makeArena(),
      actor: makeBot(),
      opponentTile: { x: 3, y: 3 },
      bombs: [],
      activeBombCount: 0,
      blockedTiles: [{ x: 3, y: 3 }]
    });

    expect(intent).toEqual({ type: "move", tile: { x: 2, y: 1 } });
  });

  it("moves from the default bot spawn toward the default player spawn", () => {
    const intent = chooseBotTurn({
      arena: createInitialArena(),
      actor: makeBot({ tile: { x: 11, y: 9 } }),
      opponentTile: { x: 1, y: 1 },
      bombs: [],
      activeBombCount: 0,
      blockedTiles: [{ x: 1, y: 1 }]
    });

    expect(intent).not.toEqual({ type: "wait" });
  });

  it("prioritizes powerups based on profile traits", () => {
    const cautiousBot = makeBot({
      profile: BOT_PROFILES["bot-b"],
      tile: { x: 2, y: 2 }
    });

    const intent = chooseBotTurn({
      arena: makeArena(),
      actor: cautiousBot,
      opponentTile: { x: 3, y: 3 },
      bombs: [],
      activeBombCount: 0,
      powerups: [{ tile: { x: 1, y: 2 }, type: "speed" }]
    });

    expect(intent).toEqual({ type: "move", tile: { x: 1, y: 2 } });
  });
});
