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

  it("accepts a campaign result for a known stage", () => {
    const result = matchResultSchema.safeParse({
      visitorId,
      mode: "campaign",
      stageId: "1-2",
      winner: "player",
      durationMs: 42000,
      blocksCleared: 11
    });

    expect(result.success).toBe(true);
  });

  it("requires a known stage for campaign results and rejects stages elsewhere", () => {
    const base = { visitorId, winner: "player", durationMs: 12000, blocksCleared: 8 };

    expect(matchResultSchema.safeParse({ ...base, mode: "campaign" }).success).toBe(false);
    expect(matchResultSchema.safeParse({ ...base, mode: "campaign", stageId: "9-9" }).success).toBe(false);
    expect(matchResultSchema.safeParse({ ...base, mode: "player-vs-bot", stageId: "1-1" }).success).toBe(false);
  });

  it("rejects skirmish winners for campaign results", () => {
    const result = matchResultSchema.safeParse({
      visitorId,
      mode: "campaign",
      stageId: "1-1",
      winner: "bot-a",
      durationMs: 12000,
      blocksCleared: 8
    });

    expect(result.success).toBe(false);
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
