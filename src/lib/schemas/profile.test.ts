import { describe, expect, it } from "vitest";
import { playerProfilePatchSchema } from "./profile";

describe("playerProfilePatchSchema", () => {
  it("accepts bounded player-editable preferences", () => {
    const result = playerProfilePatchSchema.safeParse({
      preferences: {
        musicEnabled: false,
        musicVolume: 4,
        sfxVolume: 7,
        selectedTrackId: "mach-rush",
        botSelection: {
          "bot-a": "volt-warden",
          "bot-b": "glitch-bloom"
        }
      }
    });

    expect(result.success).toBe(true);
  });

  it("rejects server-owned fields", () => {
    expect(
      playerProfilePatchSchema.safeParse({
        preferences: { musicEnabled: true },
        progression: { xp: 999999, level: 99 }
      }).success
    ).toBe(false);
  });

  it("rejects out-of-range audio and unknown preference fields", () => {
    expect(
      playerProfilePatchSchema.safeParse({
        preferences: { musicVolume: 11, admin: true }
      }).success
    ).toBe(false);
  });

  it("rejects duplicate bot selections", () => {
    expect(
      playerProfilePatchSchema.safeParse({
        preferences: {
          botSelection: {
            "bot-a": "fuse-rush",
            "bot-b": "fuse-rush"
          }
        }
      }).success
    ).toBe(false);
  });

  it("rejects empty patches", () => {
    expect(playerProfilePatchSchema.safeParse({ preferences: {} }).success).toBe(false);
  });
});
