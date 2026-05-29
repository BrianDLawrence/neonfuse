import { describe, expect, it } from "vitest";
import { matchResultSchema } from "./match";

describe("matchResultSchema", () => {
  it("accepts a valid match result", () => {
    const result = matchResultSchema.safeParse({
      winner: "player",
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

  it("rejects negative counters", () => {
    const result = matchResultSchema.safeParse({
      winner: "bot",
      durationMs: -1,
      blocksCleared: -1
    });

    expect(result.success).toBe(false);
  });
});
