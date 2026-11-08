import { describe, expect, it } from "vitest";
import { multiplayerTicketRequestSchema } from "./multiplayer";

describe("multiplayer ticket requests", () => {
  it("defaults to the duel and accepts the party lobby", () => {
    expect(multiplayerTicketRequestSchema.parse({})).toEqual({ mode: "duel" });
    expect(multiplayerTicketRequestSchema.parse({ mode: "party" })).toEqual({ mode: "party" });
  });

  it("rejects unknown modes and extra fields", () => {
    expect(multiplayerTicketRequestSchema.safeParse({ mode: "ranked" }).success).toBe(false);
    expect(multiplayerTicketRequestSchema.safeParse({ mode: "party", roomId: "x" }).success).toBe(false);
  });
});
