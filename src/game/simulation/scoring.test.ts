import { describe, expect, it } from "vitest";
import { calculateRoundScore } from "./scoring";

describe("calculateRoundScore", () => {
  it("rewards a fast player victory with cleared blocks", () => {
    const score = calculateRoundScore({
      mode: "player-vs-bot",
      winner: "player",
      durationMs: 18_000,
      blocksCleared: 12
    });

    expect(score).toBe(7444);
  });

  it("still gives a smaller score for a player loss", () => {
    const win = calculateRoundScore({
      mode: "player-vs-bot",
      winner: "player",
      durationMs: 30_000,
      blocksCleared: 4
    });
    const loss = calculateRoundScore({
      mode: "player-vs-bot",
      winner: "bot",
      durationMs: 30_000,
      blocksCleared: 4
    });

    expect(loss).toBeGreaterThan(0);
    expect(loss).toBeLessThan(win);
  });

  it("scores draws without a winner bonus spike", () => {
    const score = calculateRoundScore({
      mode: "player-vs-bot",
      winner: "draw",
      durationMs: 240_000,
      blocksCleared: 3
    });

    expect(score).toBe(2275);
  });

  it("supports bot skirmish winners", () => {
    const score = calculateRoundScore({
      mode: "bot-skirmish",
      winner: "bot-a",
      durationMs: 60_000,
      blocksCleared: 6
    });

    expect(score).toBe(4690);
  });
});
