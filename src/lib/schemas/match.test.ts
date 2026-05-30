import { describe, expect, it } from "vitest";
import { matchResultSchema } from "./match";

describe("matchResultSchema", () => {
  it("accepts a valid match result", () => {
    const result = matchResultSchema.safeParse({
      mode: "player-vs-bot",
      winner: "player",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid bot skirmish result", () => {
    const result = matchResultSchema.safeParse({
      mode: "bot-skirmish",
      winner: "bot-a",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid winners", () => {
    const result = matchResultSchema.safeParse({
      winner: "intruder",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(false);
  });

  it("rejects winners that do not match the mode", () => {
    const playerWinner = matchResultSchema.safeParse({
      mode: "bot-skirmish",
      winner: "player",
      durationMs: 12000,
      blocksCleared: 8
    });
    const skirmishWinner = matchResultSchema.safeParse({
      mode: "player-vs-bot",
      winner: "bot-a",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(playerWinner.success).toBe(false);
    expect(skirmishWinner.success).toBe(false);
  });

  it("rejects negative counters", () => {
    const result = matchResultSchema.safeParse({
      winner: "bot",
      durationMs: -1,
      blocksCleared: -1
    });

    expect(result.success).toBe(false);
  });
});
