import { describe, expect, it, vi } from "vitest";
import { DELETED_PLAYER_ID, deletePlayerData } from "@/lib/player-data-deletion";

describe("deletePlayerData", () => {
  it("removes game, Activity, and authentication records for current and legacy IDs", async () => {
    const calls: Array<{ collection: string; filter: unknown; update?: unknown }> = [];
    const db = {
      collection: (collection: string) => ({
        deleteMany: vi.fn(async (filter: unknown) => {
          calls.push({ collection, filter });
          return { deletedCount: 1 };
        }),
        updateMany: vi.fn(async (filter: unknown, update: unknown) => {
          calls.push({ collection, filter, update });
          return { modifiedCount: 1 };
        })
      })
    };

    const result = await deletePlayerData(db as never, {
      id: "stable-player",
      legacyId: "legacy-player",
      authUserId: "auth-user",
      discordUserId: "discord-user",
      displayName: "Fuse Pilot",
      source: "discord-activity"
    });

    expect(result.deletedDocuments).toBe(10);
    expect(calls.map(({ collection }) => collection)).toEqual([
      "player_profiles",
      "matches",
      "high-scores",
      "visitors",
      "duel_results",
      "activity_sessions",
      "account",
      "session",
      "user",
      "verification"
    ]);
    expect(calls.find(({ collection }) => collection === "matches")?.filter).toEqual({
      accountId: { $in: ["stable-player", "legacy-player", "auth-user"] }
    });
    expect(calls.find(({ collection }) => collection === "activity_sessions")?.filter).toEqual({
      $or: [
        { playerId: { $in: ["stable-player", "legacy-player", "auth-user"] } },
        { legacyPlayerId: { $in: ["stable-player", "legacy-player", "auth-user"] } },
        { discordUserId: "discord-user" }
      ]
    });
    const duelCall = calls.find(({ collection }) => collection === "duel_results");
    expect(duelCall?.filter).toEqual({
      players: { $in: ["stable-player", "legacy-player", "auth-user"] }
    });
    expect(duelCall?.update).toBeDefined();
    expect(JSON.stringify(duelCall?.update)).toContain(DELETED_PLAYER_ID);
    expect(calls.find(({ collection }) => collection === "account")?.filter).toEqual({
      userId: { $in: ["auth-user", "legacy-player"] }
    });
  });
});
