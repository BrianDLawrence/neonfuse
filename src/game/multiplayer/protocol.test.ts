import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "./protocol";

describe("client messages", () => {
  const input = (command: unknown) => ({ type: "input", roundId: "round-1", sequence: 3, command });

  it("accepts the move, bomb and detonate commands", () => {
    expect(clientMessageSchema.safeParse(input({ type: "move", direction: "up" })).success).toBe(true);
    expect(clientMessageSchema.safeParse(input({ type: "bomb" })).success).toBe(true);
    expect(clientMessageSchema.safeParse(input({ type: "detonate" })).success).toBe(true);
  });

  it("rejects unknown commands and extra fields, which can't carry a target or timing", () => {
    expect(clientMessageSchema.safeParse(input({ type: "kick", direction: "up" })).success).toBe(false);
    expect(clientMessageSchema.safeParse(input({ type: "detonate", bombId: 4 })).success).toBe(false);
    expect(clientMessageSchema.safeParse(input({ type: "bomb", explodesAt: 0 })).success).toBe(false);
  });
});
