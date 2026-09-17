import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyDiscordActivityInstance } from "@/lib/discord-activity-instance";

const identity = {
  playerId: "player-a",
  discordUserId: "discord-a",
  displayName: "Alice",
  instanceId: "party"
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyDiscordActivityInstance", () => {
  it("returns members only after matching the app, instance, and caller", async () => {
    vi.stubEnv("DISCORD_CLIENT_ID", "app");
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          application_id: "app",
          instance_id: "party",
          users: ["discord-a", "discord-b"]
        })
      )
    );

    await expect(verifyDiscordActivityInstance(identity)).resolves.toEqual({
      ok: true,
      discordUserIds: ["discord-a", "discord-b"]
    });
  });

  it("rejects forged membership and malformed instance responses", async () => {
    vi.stubEnv("DISCORD_CLIENT_ID", "app");
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ application_id: "other-app", instance_id: "party", users: ["discord-a"] })
      )
    );

    await expect(verifyDiscordActivityInstance(identity)).resolves.toMatchObject({
      ok: false,
      status: 403
    });
  });

  it("preserves Discord throttling and reports missing server configuration", async () => {
    await expect(verifyDiscordActivityInstance(identity)).resolves.toMatchObject({
      ok: false,
      status: 503
    });

    vi.stubEnv("DISCORD_CLIENT_ID", "app");
    vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));

    await expect(verifyDiscordActivityInstance(identity)).resolves.toMatchObject({
      ok: false,
      status: 429
    });
  });
});
