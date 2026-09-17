import { describe, expect, it } from "vitest";
import { discordPlayerId } from "@/lib/discord-identity";
import { buildDiscordPartyRoster } from "@/lib/discord-party";

describe("buildDiscordPartyRoster", () => {
  it("builds safe public cards from connected Activity members", () => {
    const aliceId = discordPlayerId("discord-a");
    const bobId = discordPlayerId("discord-b");
    const roster = buildDiscordPartyRoster({
      discordUserIds: ["discord-b", "discord-a"],
      currentDiscordUserId: "discord-a",
      sessionsNewestFirst: [
        {
          discordUserId: "discord-a",
          playerId: aliceId,
          displayName: "Alice",
          avatarUrl: "https://cdn.example/alice.png"
        },
        {
          discordUserId: "discord-b",
          playerId: bobId,
          displayName: "Bob"
        }
      ],
      profiles: [
        {
          playerId: aliceId,
          progression: { equippedTitle: "duel-certified" }
        },
        {
          playerId: bobId,
          progression: { equippedTitle: "fuse-initiate" }
        }
      ],
      localMatches: [
        { accountId: aliceId, winner: "player", score: 8_000 },
        { accountId: bobId, winner: "bot", score: 1_000 }
      ],
      duelsOldestFirst: [
        { players: [aliceId, bobId], winnerId: aliceId },
        { players: [aliceId, bobId], winnerId: null }
      ]
    });

    expect(roster.connectedCount).toBe(2);
    expect(roster.members[0]).toEqual({
      displayName: "Alice",
      avatarUrl: "https://cdn.example/alice.png",
      title: "Duel Certified",
      level: 1,
      duel: { played: 2, wins: 1, losses: 0, draws: 1 },
      isCurrentPlayer: true,
      profileReady: true
    });
    expect(roster.members[1]).toMatchObject({
      displayName: "Bob",
      isCurrentPlayer: false,
      duel: { played: 2, wins: 0, losses: 1, draws: 1 }
    });
    expect(roster.members[0]).not.toHaveProperty("playerId");
    expect(roster.members[0]).not.toHaveProperty("discordUserId");
  });

  it("deduplicates members and safely represents a participant still loading", () => {
    const roster = buildDiscordPartyRoster({
      discordUserIds: ["discord-a", "discord-a", "discord-b"],
      currentDiscordUserId: "discord-a",
      sessionsNewestFirst: [
        {
          discordUserId: "discord-a",
          playerId: discordPlayerId("discord-a"),
          displayName: "Alice"
        }
      ],
      profiles: [],
      localMatches: [],
      duelsOldestFirst: []
    });

    expect(roster.connectedCount).toBe(2);
    expect(roster.members).toHaveLength(2);
    expect(roster.members[1]).toMatchObject({
      displayName: "Joining…",
      title: "Fuse Initiate",
      level: 1,
      profileReady: false
    });
  });

  it("keeps the current player inside the bounded roster", () => {
    const discordUserIds = Array.from({ length: 30 }, (_, index) => `discord-${index}`);
    const currentDiscordUserId = discordUserIds.at(-1)!;
    const roster = buildDiscordPartyRoster({
      discordUserIds,
      currentDiscordUserId,
      sessionsNewestFirst: [
        {
          discordUserId: currentDiscordUserId,
          playerId: discordPlayerId(currentDiscordUserId),
          displayName: "Current Player"
        }
      ],
      profiles: [],
      localMatches: [],
      duelsOldestFirst: []
    });

    expect(roster.connectedCount).toBe(25);
    expect(roster.members[0]).toMatchObject({
      displayName: "Current Player",
      isCurrentPlayer: true
    });
  });
});
