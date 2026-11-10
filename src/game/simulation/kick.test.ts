import { describe, expect, it } from "vitest";
import type { ArenaGrid } from "./arena";
import { KICK_STEP_MS, projectSlideStop, slideAwareThreats, stepSlides, tryKick, type KickableBomb } from "./kick";

// A 7-wide corridor: hard walls round it, one soft block at x=5 on the middle row.
const arena: ArenaGrid = [
  ["hard", "hard", "hard", "hard", "hard", "hard", "hard"],
  ["hard", "floor", "floor", "floor", "floor", "soft", "hard"],
  ["hard", "hard", "hard", "hard", "hard", "hard", "hard"]
];

describe("tryKick", () => {
  const bombs: KickableBomb[] = [{ id: 1, tile: { x: 2, y: 1 } }];

  it("starts a resting bomb sliding away from the kicker", () => {
    expect(tryKick({ arena, bombs, fighters: [] }, { x: 1, y: 1 }, "right", 1000)).toEqual({
      bombId: 1,
      slide: { direction: "right", nextStepAt: 1000 + KICK_STEP_MS }
    });
  });

  it("does nothing without a bomb in the way", () => {
    expect(tryKick({ arena, bombs, fighters: [] }, { x: 3, y: 1 }, "right", 1000)).toBeNull();
  });

  it("cannot kick a bomb pinned against a wall, a bomb or a fighter", () => {
    expect(tryKick({ arena, bombs: [{ id: 1, tile: { x: 4, y: 1 } }], fighters: [] }, { x: 3, y: 1 }, "right", 0)).toBeNull();
    expect(tryKick({ arena, bombs: [...bombs, { id: 2, tile: { x: 3, y: 1 } }], fighters: [] }, { x: 1, y: 1 }, "right", 0)).toBeNull();
    expect(tryKick({ arena, bombs, fighters: [{ x: 3, y: 1 }] }, { x: 1, y: 1 }, "right", 0)).toBeNull();
  });

  it("cannot kick a bomb that is already sliding", () => {
    const sliding = [{ id: 1, tile: { x: 2, y: 1 }, slide: { direction: "right" as const, nextStepAt: 50 } }];
    expect(tryKick({ arena, bombs: sliding, fighters: [] }, { x: 1, y: 1 }, "right", 0)).toBeNull();
  });
});

describe("stepSlides", () => {
  const kicked = [{ id: 1, tile: { x: 1, y: 1 }, slide: { direction: "right" as const, nextStepAt: 100 } }];

  it("moves one tile per step and nothing before the step is due", () => {
    expect(stepSlides({ arena, fighters: [] }, kicked, 99)).toEqual(kicked);
    expect(stepSlides({ arena, fighters: [] }, kicked, 100)[0]).toEqual({
      id: 1, tile: { x: 2, y: 1 }, slide: { direction: "right", nextStepAt: 200 }
    });
  });

  it("catches up on late ticks and stops in front of a soft block", () => {
    const [bomb] = stepSlides({ arena, fighters: [] }, kicked, 10_000);
    expect(bomb.tile).toEqual({ x: 4, y: 1 });
    expect(bomb.slide).toBeUndefined();
  });

  it("stops in front of a fighter without hurting them", () => {
    const [bomb] = stepSlides({ arena, fighters: [{ x: 3, y: 1 }] }, kicked, 10_000);
    expect(bomb.tile).toEqual({ x: 2, y: 1 });
    expect(bomb.slide).toBeUndefined();
  });

  it("stops in front of another bomb", () => {
    const [bomb] = stepSlides({ arena, fighters: [] }, [...kicked, { id: 2, tile: { x: 4, y: 1 } }], 10_000);
    expect(bomb.tile).toEqual({ x: 3, y: 1 });
  });

  it("leaves resting bombs alone and never mutates its input", () => {
    const resting = [{ id: 3, tile: { x: 2, y: 1 } }];
    expect(stepSlides({ arena, fighters: [] }, resting, 10_000)).toEqual(resting);
    stepSlides({ arena, fighters: [] }, kicked, 10_000);
    expect(kicked[0].tile).toEqual({ x: 1, y: 1 });
  });
});

describe("projectSlideStop", () => {
  it("names the tile a sliding bomb will rest on", () => {
    const bomb = { id: 1, tile: { x: 1, y: 1 }, slide: { direction: "right" as const, nextStepAt: 0 } };
    expect(projectSlideStop({ arena, bombs: [bomb], fighters: [] }, bomb)).toEqual({ x: 4, y: 1 });
    expect(projectSlideStop({ arena, bombs: [bomb], fighters: [] }, { id: 2, tile: { x: 2, y: 1 } })).toEqual({ x: 2, y: 1 });
  });
});

describe("slideAwareThreats", () => {
  it("adds a sliding bomb's stopping tile, and leaves resting bombs as they are", () => {
    const sliding = { id: 1, tile: { x: 1, y: 1 }, range: 2, slide: { direction: "right" as const, nextStepAt: 0 } };
    const resting = { id: 2, tile: { x: 1, y: 1 }, range: 2 };
    expect(slideAwareThreats({ arena, fighters: [] }, [sliding])).toEqual([
      { tile: { x: 1, y: 1 }, range: 2 },
      { tile: { x: 4, y: 1 }, range: 2 }
    ]);
    expect(slideAwareThreats({ arena, fighters: [] }, [resting])).toEqual([{ tile: { x: 1, y: 1 }, range: 2 }]);
  });
});
