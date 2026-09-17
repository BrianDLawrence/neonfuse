import type { Db, WithId } from "mongodb";
import type { PlayerIdentity } from "@/lib/player-identity";
import { calculatePlayerProgression } from "@/game/simulation/progression";
import {
  DEFAULT_PROFILE_PREFERENCES,
  EMPTY_PROFILE_MATCH_STATS,
  type PlayerProfile,
  type ProfilePreferences
} from "@/lib/player-profile-types";
import type { PlayerProfilePatch } from "@/lib/schemas/profile";

type PlayerProfileDocument = Omit<
  PlayerProfile,
  "identity" | "createdAt" | "updatedAt" | "lastSeenAt"
> & {
  identity: Omit<PlayerProfile["identity"], "refreshedAt"> & { refreshedAt: Date };
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
};

const COLLECTION_NAME = "player_profiles";

function defaultDocument(now: Date): Omit<PlayerProfileDocument, "playerId" | "identity" | "lastSeenAt"> {
  return {
    preferences: {
      ...DEFAULT_PROFILE_PREFERENCES,
      botSelection: { ...DEFAULT_PROFILE_PREFERENCES.botSelection }
    },
    progression: calculatePlayerProgression({
      local: EMPTY_PROFILE_MATCH_STATS,
      duel: EMPTY_PROFILE_MATCH_STATS,
      bestScore: 0,
      bestWinStreak: 0
    }),
    stats: {
      local: { ...EMPTY_PROFILE_MATCH_STATS },
      duel: { ...EMPTY_PROFILE_MATCH_STATS },
      bestScore: 0,
      bestWinStreak: 0
    },
    createdAt: now,
    updatedAt: now
  };
}

function identityFields(player: PlayerIdentity, now: Date): PlayerProfileDocument["identity"] {
  return {
    displayName: player.displayName,
    avatarUrl: player.avatarUrl ?? null,
    source: player.source,
    refreshedAt: now
  };
}

export function profileDocumentToView(document: WithId<PlayerProfileDocument>): PlayerProfile {
  return {
    playerId: document.playerId,
    identity: {
      ...document.identity,
      refreshedAt: document.identity.refreshedAt.toISOString()
    },
    preferences: document.preferences,
    progression: document.progression,
    stats: document.stats,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    lastSeenAt: document.lastSeenAt.toISOString()
  };
}

export async function getOrCreatePlayerProfile(
  db: Db,
  player: PlayerIdentity
): Promise<{ profile: PlayerProfile; created: boolean }> {
  const now = new Date();
  const result = await db.collection<PlayerProfileDocument>(COLLECTION_NAME).updateOne(
    { playerId: player.id },
    {
      $set: {
        identity: identityFields(player, now),
        lastSeenAt: now
      },
      $setOnInsert: {
        playerId: player.id,
        ...defaultDocument(now)
      }
    },
    { upsert: true }
  );
  const document = await db
    .collection<PlayerProfileDocument>(COLLECTION_NAME)
    .findOne({ playerId: player.id });

  if (!document) {
    throw new Error("Player profile was not available after upsert.");
  }

  return {
    profile: profileDocumentToView(document),
    created: result.upsertedCount === 1
  };
}

function preferenceUpdates(preferences: Partial<ProfilePreferences>) {
  const updates: Record<string, boolean | number | string | null | ProfilePreferences["botSelection"]> = {};

  for (const [key, value] of Object.entries(preferences)) {
    if (value !== undefined) {
      updates[`preferences.${key}`] = value;
    }
  }

  return updates;
}

export async function updatePlayerProfile(
  db: Db,
  player: PlayerIdentity,
  patch: PlayerProfilePatch
): Promise<PlayerProfile> {
  await getOrCreatePlayerProfile(db, player);
  const now = new Date();
  const updates = preferenceUpdates(patch.preferences ?? {});

  if (patch.equippedTitle !== undefined) {
    updates["progression.equippedTitle"] = patch.equippedTitle;
  }

  await db.collection<PlayerProfileDocument>(COLLECTION_NAME).updateOne(
    { playerId: player.id },
    {
      $set: {
        ...updates,
        identity: identityFields(player, now),
        updatedAt: now,
        lastSeenAt: now
      }
    }
  );
  const document = await db
    .collection<PlayerProfileDocument>(COLLECTION_NAME)
    .findOne({ playerId: player.id });

  if (!document) {
    throw new Error("Player profile was not available after update.");
  }

  return profileDocumentToView(document);
}
