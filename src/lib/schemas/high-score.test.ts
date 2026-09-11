import { describe, expect, it } from "vitest";
import { highScoreModeSchema, highScoreSubmitSchema } from "./high-score";

describe("highScoreModeSchema", () => {
  it("accepts all supported filters", () => {
    expect(highScoreModeSchema.safeParse("all").success).toBe(true);
    expect(highScoreModeSchema.safeParse("player-vs-bot").success).toBe(true);
    expect(highScoreModeSchema.safeParse("bot-skirmish").success).toBe(true);
  });

  it("rejects unsupported filters", () => {
    expect(highScoreModeSchema.safeParse("campaign").success).toBe(false);
  });
});

describe("highScoreSubmitSchema", () => {
  it("accepts a match ID while discarding client-submitted identity fields", () => {
    const result = highScoreSubmitSchema.safeParse({
      matchId: "665f0d4d9b95f84a0b0f0001",
      visitorId: "00000000-0000-4000-8000-000000000001",
      playerName: "Spoofed Player"
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data : null).toEqual({
      matchId: "665f0d4d9b95f84a0b0f0001"
    });
  });

  it("rejects a missing match ID", () => {
    const result = highScoreSubmitSchema.safeParse({
      playerName: "NeonPilot"
    });

    expect(result.success).toBe(false);
  });
});
