import { describe, expect, it } from "vitest";
import { matchResultSchema } from "./match";

const visitorId = "00000000-0000-4000-8000-000000000001";

describe("matchResultSchema", () => {
  it("accepts a valid match result", () => {
    const result = matchResultSchema.safeParse({
      visitorId,
      mode: "player-vs-bot",
      winner: "player",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid bot skirmish result", () => {
    const result = matchResultSchema.safeParse({
      visitorId,
      mode: "bot-skirmish",
      winner: "bot-a",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid winners", () => {
    const result = matchResultSchema.safeParse({
      visitorId,
      winner: "intruder",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(false);
  });

  it("rejects winners that do not match the mode", () => {
    const playerWinner = matchResultSchema.safeParse({
      visitorId,
      mode: "bot-skirmish",
      winner: "player",
      durationMs: 12000,
      blocksCleared: 8
    });
    const skirmishWinner = matchResultSchema.safeParse({
      visitorId,
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
      visitorId,
      winner: "bot",
      durationMs: -1,
      blocksCleared: -1
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing visitor id", () => {
    const result = matchResultSchema.safeParse({
      winner: "bot",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(false);
  });
});
