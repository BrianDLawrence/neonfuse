import { describe, expect, it } from "vitest";
import { discordPlayerId } from "./discord-identity";

describe("discordPlayerId", () => {
  it("creates a stable private identifier for a Discord user", () => {
    const playerId = discordPlayerId("123456789");

    expect(playerId).toBe(discordPlayerId("123456789"));
    expect(playerId).toMatch(/^discord-[a-f0-9]{64}$/);
    expect(playerId).not.toContain("123456789");
  });

  it("keeps different Discord users separate", () => {
    expect(discordPlayerId("user-a")).not.toBe(discordPlayerId("user-b"));
  });
});
