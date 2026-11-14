import { describe, expect, it } from "vitest";
import { isMusicTrackEditor } from "./music-track-editors";

describe("music track editor allowlist", () => {
  it("allows nobody when the allowlist is unset or empty", () => {
    expect(isMusicTrackEditor({ discordUserId: "111" }, undefined)).toBe(false);
    expect(isMusicTrackEditor({ discordUserId: "111" }, "")).toBe(false);
    expect(isMusicTrackEditor({ discordUserId: "111" }, " , ")).toBe(false);
  });

  it("allows only the listed Discord accounts", () => {
    expect(isMusicTrackEditor({ discordUserId: "222" }, "111, 222")).toBe(true);
    expect(isMusicTrackEditor({ discordUserId: "333" }, "111, 222")).toBe(false);
  });

  it("matches whole IDs, never a prefix", () => {
    expect(isMusicTrackEditor({ discordUserId: "11" }, "111")).toBe(false);
  });

  it("rejects a player with no verified Discord account", () => {
    expect(isMusicTrackEditor({}, "111")).toBe(false);
  });
});
