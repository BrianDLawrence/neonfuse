import { describe, expect, it } from "vitest";
import { directionToDelta, type Direction } from "./arena";

describe("directionToDelta", () => {
  it("maps each direction to a single-step grid delta", () => {
    expect(directionToDelta("up")).toEqual({ x: 0, y: -1 });
    expect(directionToDelta("down")).toEqual({ x: 0, y: 1 });
    expect(directionToDelta("left")).toEqual({ x: -1, y: 0 });
    expect(directionToDelta("right")).toEqual({ x: 1, y: 0 });
  });

  it("only ever moves one tile along one axis", () => {
    const directions: Direction[] = ["up", "down", "left", "right"];

    for (const direction of directions) {
      const delta = directionToDelta(direction);
      expect(Math.abs(delta.x) + Math.abs(delta.y)).toBe(1);
    }
  });
});
