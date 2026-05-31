import { describe, expect, it } from "vitest";
import { createInitialArena, type ArenaGrid } from "./arena";
import {
  BOT_PROFILE_ORDER,
  BOT_PROFILES,
  DEFAULT_BOT_SELECTION,
  chooseBotTurn,
  type BotActorState
} from "./bots";
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
    profile: BOT_PROFILES["fuse-rush"],
    turn: 0,
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

  it("lets the cautious profile drop bombs when the opening is good", () => {
    const intent = chooseBotTurn({
      arena: makeSoftArena(),
      actor: makeBot({ profile: BOT_PROFILES["circuit-shade"] }),
      opponentTile: { x: 3, y: 3 },
      bombs: [],
      activeBombCount: 0
    });

    expect(intent.type).toBe("plant-bomb");
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

  it("varies pressure paths when the decision seed changes", () => {
    const lowSeed = chooseBotTurn({
      arena: makeArena(),
      actor: makeBot(),
      opponentTile: { x: 3, y: 3 },
      bombs: [],
      activeBombCount: 0,
      blockedTiles: [{ x: 3, y: 3 }],
      decisionSeed: 2
    });
    const highSeed = chooseBotTurn({
      arena: makeArena(),
      actor: makeBot(),
      opponentTile: { x: 3, y: 3 },
      bombs: [],
      activeBombCount: 0,
      blockedTiles: [{ x: 3, y: 3 }],
      decisionSeed: 3
    });

    expect(lowSeed).toEqual({ type: "move", tile: { x: 2, y: 1 } });
    expect(highSeed).toEqual({ type: "move", tile: { x: 1, y: 2 } });
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
      profile: BOT_PROFILES["circuit-shade"],
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

  it("keeps all bot profile traits bounded for future generated profiles", () => {
    BOT_PROFILE_ORDER.forEach((profileId) => {
      const profile = BOT_PROFILES[profileId];

      expect(profile.id).toBe(profileId);
      expect(profile.name.length).toBeGreaterThan(0);
      expect(profile.llmPersona.length).toBeGreaterThan(0);
      Object.values(profile.traits).forEach((trait) => {
        expect(trait).toBeGreaterThanOrEqual(1);
        expect(trait).toBeLessThanOrEqual(10);
      });
    });
  });

  it("defines a distinct default bot skirmish selection", () => {
    expect(DEFAULT_BOT_SELECTION["bot-a"]).not.toBe(DEFAULT_BOT_SELECTION["bot-b"]);
    expect(BOT_PROFILES[DEFAULT_BOT_SELECTION["bot-a"]]).toBeDefined();
    expect(BOT_PROFILES[DEFAULT_BOT_SELECTION["bot-b"]]).toBeDefined();
  });
});
