import { describe, expect, it } from "vitest";
import { discordPlayerId } from "@/lib/discord-identity";
import { getActStages } from "@/game/simulation/campaign";
import { buildDiscordPartyRoster } from "@/lib/discord-party";

describe("buildDiscordPartyRoster", () => {
  it("never counts Party Brawl rounds as duels and adds their XP to the level", () => {
    const aliceId = discordPlayerId("discord-a");
    const input = {
      discordUserIds: ["discord-a"],
      currentDiscordUserId: "discord-a",
      sessionsNewestFirst: [{ discordUserId: "discord-a", playerId: aliceId, displayName: "Alice" }],
      profiles: [{ playerId: aliceId }],
      localMatches: []
    };
    const party = Array.from({ length: 6 }, () => ({ players: [aliceId, "rival"], winnerId: aliceId, mode: "party" as const, outcome: "human" as const }));
    const roster = buildDiscordPartyRoster({
      ...input,
      duelsOldestFirst: [...party, { players: [aliceId, "rival"], winnerId: null, mode: "party", outcome: "bot" }],
      partySeries: [{ winner: { kind: "human", playerId: aliceId } }, { winner: { kind: "bot" } }]
    });

    expect(roster.members[0].duel).toEqual({ played: 0, wins: 0, losses: 0, draws: 0 });
    // 7 rounds x 30 + 6 wins x 60 + 1 series x 100 = 670 XP, level 2.
    expect(roster.members[0].level).toBe(2);
  });

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

  it("shows an equipped act title only once the member has cleared the act", () => {
    const aliceId = discordPlayerId("discord-a");
    const bobId = discordPlayerId("discord-b");
    const actOneWins = getActStages(1).map((stage) => ({
      accountId: aliceId,
      stageId: stage.id,
      winner: "player" as const,
      durationMs: 60_000,
      blocksCleared: 10
    }));
    const roster = buildDiscordPartyRoster({
      discordUserIds: ["discord-a", "discord-b"],
      currentDiscordUserId: "discord-a",
      sessionsNewestFirst: [
        { discordUserId: "discord-a", playerId: aliceId, displayName: "Alice" },
        { discordUserId: "discord-b", playerId: bobId, displayName: "Bob" }
      ],
      profiles: [
        { playerId: aliceId, progression: { equippedTitle: "ladder-climber" } },
        { playerId: bobId, progression: { equippedTitle: "ladder-climber" } }
      ],
      localMatches: [],
      duelsOldestFirst: [],
      campaignWinsOldestFirst: actOneWins
    });

    expect(roster.members.find((member) => member.displayName === "Alice")?.title).toBe(
      "Ladder Climber"
    );
    expect(roster.members.find((member) => member.displayName === "Bob")?.title).toBe(
      "Fuse Initiate"
    );
  });
});
