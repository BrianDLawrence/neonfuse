import { describe, expect, it } from "vitest";
import { highScoreInitialsSchema, highScoreModeSchema, highScoreSubmitSchema } from "./high-score";

const visitorId = "00000000-0000-4000-8000-000000000001";

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

describe("highScoreInitialsSchema", () => {
  it("normalizes lowercase initials", () => {
    expect(highScoreInitialsSchema.parse("abc")).toBe("ABC");
  });

  it("rejects non-letter or non-3-character initials", () => {
    expect(highScoreInitialsSchema.safeParse("AB1").success).toBe(false);
    expect(highScoreInitialsSchema.safeParse("ABCD").success).toBe(false);
  });
});

describe("highScoreSubmitSchema", () => {
  it("accepts a valid submission", () => {
    const result = highScoreSubmitSchema.safeParse({
      matchId: "665f0d4d9b95f84a0b0f0001",
      visitorId,
      initials: "nfx"
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.initials : "").toBe("NFX");
  });

  it("rejects invalid visitor ids", () => {
    const result = highScoreSubmitSchema.safeParse({
      matchId: "665f0d4d9b95f84a0b0f0001",
      visitorId: "local",
      initials: "NFX"
    });

    expect(result.success).toBe(false);
  });
});
