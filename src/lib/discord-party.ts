import type { Db, Filter } from "mongodb";
import { discordPlayerId } from "@/lib/discord-identity";
import { summarizePlayerCareer, type DuelCareerRecord, type LocalCareerRecord } from "@/lib/player-career";
import type { DiscordPartyRoster } from "@/lib/player-profile-types";
import {
  PLAYER_TITLES,
  calculatePlayerProgression,
  type PlayerTitleId
} from "@/game/simulation/progression";

const MAX_PARTY_MEMBERS = 25;

export type PartySessionRecord = {
  discordUserId: string;
  playerId: string;
  legacyPlayerId?: string;
  displayName: string;
  avatarUrl?: string;
};

export type PartyProfileRecord = {
  playerId: string;
  identity?: { displayName?: string; avatarUrl?: string | null };
  progression?: { equippedTitle?: PlayerTitleId | null };
};

export type PartyLocalRecord = LocalCareerRecord & { accountId: string };
export type PartyDuelRecord = DuelCareerRecord & { players: string[] };

type PartyRosterInput = {
  discordUserIds: string[];
  currentDiscordUserId: string;
  sessionsNewestFirst: PartySessionRecord[];
  profiles: PartyProfileRecord[];
  localMatches: PartyLocalRecord[];
  duelsOldestFirst: PartyDuelRecord[];
};

type ActivitySessionDocument = PartySessionRecord & {
  instanceId: string;
  createdAt: Date;
  expiresAt: Date;
};

function connectedDiscordIds(discordUserIds: string[], currentDiscordUserId: string): string[] {
  const uniqueIds = Array.from(new Set(discordUserIds.filter(Boolean)));
  return [
    ...(uniqueIds.includes(currentDiscordUserId) ? [currentDiscordUserId] : []),
    ...uniqueIds.filter((id) => id !== currentDiscordUserId)
  ].slice(0, MAX_PARTY_MEMBERS);
}

/** Builds public party cards without exposing internal or Discord identifiers. */
export function buildDiscordPartyRoster({
  discordUserIds,
  currentDiscordUserId,
  sessionsNewestFirst,
  profiles,
  localMatches,
  duelsOldestFirst
}: PartyRosterInput): DiscordPartyRoster {
  const connectedIds = connectedDiscordIds(discordUserIds, currentDiscordUserId);
  const sessions = new Map<string, PartySessionRecord>();

  for (const session of sessionsNewestFirst) {
    if (!sessions.has(session.discordUserId)) {
      sessions.set(session.discordUserId, session);
    }
  }

  const profileByPlayerId = new Map(profiles.map((profile) => [profile.playerId, profile]));
  const accountOwner = new Map<string, string>();

  for (const discordUserId of connectedIds) {
    const session = sessions.get(discordUserId);
    const playerId = session?.playerId ?? discordPlayerId(discordUserId);
    accountOwner.set(playerId, playerId);
    if (session?.legacyPlayerId) accountOwner.set(session.legacyPlayerId, playerId);
  }

  const members = connectedIds.map((discordUserId) => {
    const session = sessions.get(discordUserId);
    const playerId = session?.playerId ?? discordPlayerId(discordUserId);
    const profile = profileByPlayerId.get(playerId);
    const memberLocalMatches = localMatches.filter(
      (match) => accountOwner.get(match.accountId) === playerId
    );
    const memberDuels = duelsOldestFirst.filter((duel) => duel.players.includes(playerId));
    const career = summarizePlayerCareer(memberLocalMatches, memberDuels, playerId);
    const progression = calculatePlayerProgression(
      career,
      profile?.progression?.equippedTitle ?? null
    );

    return {
      displayName: session?.displayName ?? profile?.identity?.displayName ?? "Joining…",
      avatarUrl: session?.avatarUrl ?? profile?.identity?.avatarUrl ?? null,
      title: PLAYER_TITLES[progression.equippedTitle].name,
      level: progression.level,
      duel: career.duel,
      isCurrentPlayer: discordUserId === currentDiscordUserId,
      profileReady: Boolean(profile)
    };
  });

  members.sort((left, right) => {
    if (left.isCurrentPlayer !== right.isCurrentPlayer) return left.isCurrentPlayer ? -1 : 1;
    if (left.profileReady !== right.profileReady) return left.profileReady ? -1 : 1;
    return left.displayName.localeCompare(right.displayName);
  });

  return { connectedCount: connectedIds.length, members };
}

export async function loadDiscordPartyRoster(
  db: Db,
  instanceId: string,
  discordUserIds: string[],
  currentDiscordUserId: string
): Promise<DiscordPartyRoster> {
  const connectedIds = connectedDiscordIds(discordUserIds, currentDiscordUserId);
  const sessions = await db
    .collection<ActivitySessionDocument>("activity_sessions")
    .find(
      {
        instanceId,
        discordUserId: { $in: connectedIds },
        expiresAt: { $gt: new Date() }
      } as Filter<ActivitySessionDocument>,
      {
        projection: {
          discordUserId: 1,
          playerId: 1,
          legacyPlayerId: 1,
          displayName: 1,
          avatarUrl: 1,
          createdAt: 1
        }
      }
    )
    .sort({ createdAt: -1 })
    .toArray();
  const playerIds = connectedIds.map(
    (discordUserId) => sessions.find((session) => session.discordUserId === discordUserId)?.playerId ?? discordPlayerId(discordUserId)
  );
  const accountIds = Array.from(
    new Set([
      ...playerIds,
      ...sessions.flatMap((session) => session.legacyPlayerId ? [session.legacyPlayerId] : [])
    ])
  );
  const [profiles, localMatches, duels] = await Promise.all([
    db
      .collection<PartyProfileRecord>("player_profiles")
      .find(
        { playerId: { $in: playerIds } },
        { projection: { playerId: 1, identity: 1, "progression.equippedTitle": 1 } }
      )
      .toArray(),
    db
      .collection<PartyLocalRecord>("matches")
      .find(
        { accountId: { $in: accountIds }, mode: "player-vs-bot" } as Filter<PartyLocalRecord>,
        { projection: { accountId: 1, winner: 1, score: 1 } }
      )
      .toArray(),
    db
      .collection<PartyDuelRecord>("duel_results")
      .find(
        { players: { $in: playerIds } } as Filter<PartyDuelRecord>,
        { projection: { players: 1, winnerId: 1 } }
      )
      .sort({ createdAt: 1 })
      .toArray()
  ]);

  return buildDiscordPartyRoster({
    discordUserIds: connectedIds,
    currentDiscordUserId,
    sessionsNewestFirst: sessions,
    profiles,
    localMatches,
    duelsOldestFirst: duels
  });
}
