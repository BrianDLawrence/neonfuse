import type { Db, Filter } from "mongodb";
import type { PlayerIdentity } from "@/lib/player-identity";

type DeletionDocument = Record<string, unknown>;

export type PlayerDataDeletionResult = {
  deletedDocuments: number;
};

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function deleteFrom(
  db: Db,
  collectionName: string,
  filter: Filter<DeletionDocument>
): Promise<number> {
  const result = await db.collection<DeletionDocument>(collectionName).deleteMany(filter);
  return result.deletedCount;
}

export async function deletePlayerData(
  db: Db,
  player: PlayerIdentity
): Promise<PlayerDataDeletionResult> {
  const playerIds = unique([player.id, player.legacyId, player.authUserId]);
  const authUserIds = unique([player.authUserId, player.legacyId]);
  const activitySessionFilters: Filter<DeletionDocument>[] = [
    { playerId: { $in: playerIds } },
    { legacyPlayerId: { $in: playerIds } }
  ];

  if (player.discordUserId) {
    activitySessionFilters.push({ discordUserId: player.discordUserId });
  }

  const gameDeletionCounts = await Promise.all([
    deleteFrom(db, "player_profiles", { playerId: { $in: playerIds } }),
    deleteFrom(db, "matches", { accountId: { $in: playerIds } }),
    deleteFrom(db, "high-scores", { accountId: { $in: playerIds } }),
    deleteFrom(db, "visitors", { accountId: { $in: playerIds } }),
    deleteFrom(db, "duel_results", { players: { $in: playerIds } }),
    deleteFrom(db, "activity_sessions", { $or: activitySessionFilters })
  ]);

  const authDeletionCounts = authUserIds.length
    ? await Promise.all([
        deleteFrom(db, "account", { userId: { $in: authUserIds } }),
        deleteFrom(db, "session", { userId: { $in: authUserIds } }),
        deleteFrom(db, "user", { id: { $in: authUserIds } }),
        deleteFrom(db, "verification", { identifier: { $in: authUserIds } })
      ])
    : [];

  return {
    deletedDocuments: [...gameDeletionCounts, ...authDeletionCounts].reduce(
      (total, count) => total + count,
      0
    )
  };
}
