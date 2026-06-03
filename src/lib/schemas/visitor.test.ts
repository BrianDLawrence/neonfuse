import { describe, expect, it } from "vitest";
import { visitorRequestSchema } from "./visitor";

describe("visitorRequestSchema", () => {
  it("accepts an empty visitor request", () => {
    expect(visitorRequestSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a UUID visitor id", () => {
    expect(
      visitorRequestSchema.safeParse({
        visitorId: "00000000-0000-4000-8000-000000000001"
      }).success
    ).toBe(true);
  });

  it("rejects a malformed visitor id", () => {
    expect(visitorRequestSchema.safeParse({ visitorId: "player-one" }).success).toBe(false);
  });
});
