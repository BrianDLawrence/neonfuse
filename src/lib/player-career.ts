import type { Db, Filter } from "mongodb";
import type { PlayerIdentity } from "@/lib/player-identity";
import {
  EMPTY_PROFILE_MATCH_STATS,
  type PlayerCareerMatch,
  type PlayerCareerStats,
  type ProfileMatchStats
} from "@/lib/player-profile-types";

export type LocalCareerRecord = {
  winner: "player" | "bot" | "draw";
  score: number;
};

export type DuelCareerRecord = {
  winnerId: string | null;
};

type LocalMatchDocument = LocalCareerRecord & {
  accountId: string;
  mode: "player-vs-bot";
  durationMs: number;
  blocksCleared: number;
  createdAt: Date;
};

type DuelResultDocument = DuelCareerRecord & {
  roundId: string;
  players: string[];
  reason: string;
  durationMs: number;
  createdAt: Date;
};

type ProfileIdentityDocument = {
  playerId: string;
  identity?: { displayName?: string };
};

function tally(results: Array<"win" | "loss" | "draw">): ProfileMatchStats {
  return results.reduce<ProfileMatchStats>(
    (stats, result) => ({
      played: stats.played + 1,
      wins: stats.wins + (result === "win" ? 1 : 0),
      losses: stats.losses + (result === "loss" ? 1 : 0),
      draws: stats.draws + (result === "draw" ? 1 : 0)
    }),
    { ...EMPTY_PROFILE_MATCH_STATS }
  );
}

function localResult(winner: LocalCareerRecord["winner"]): "win" | "loss" | "draw" {
  if (winner === "player") return "win";
  if (winner === "bot") return "loss";
  return "draw";
}

function duelResult(winnerId: string | null, playerId: string): "win" | "loss" | "draw" {
  if (winnerId === null) return "draw";
  return winnerId === playerId ? "win" : "loss";
}

export function summarizePlayerCareer(
  localMatches: LocalCareerRecord[],
  duelsOldestFirst: DuelCareerRecord[],
  playerId: string
): PlayerCareerStats {
  const duelResults = duelsOldestFirst.map((duel) => duelResult(duel.winnerId, playerId));
  let streak = 0;
  let bestWinStreak = 0;

  for (const result of duelResults) {
    streak = result === "win" ? streak + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, streak);
  }

  return {
    local: tally(localMatches.map((match) => localResult(match.winner))),
    duel: tally(duelResults),
    bestScore: localMatches.reduce((best, match) => Math.max(best, match.score), 0),
    bestWinStreak
  };
}

function accountFilter(player: PlayerIdentity): string | { $in: string[] } {
  return player.legacyId ? { $in: [player.id, player.legacyId] } : player.id;
}

export async function loadPlayerCareer(db: Db, player: PlayerIdentity): Promise<PlayerCareerStats> {
  const [localMatches, duels] = await Promise.all([
    db
      .collection<LocalMatchDocument>("matches")
      .find(
        { accountId: accountFilter(player), mode: "player-vs-bot" } as Filter<LocalMatchDocument>,
        { projection: { winner: 1, score: 1 } }
      )
      .toArray(),
    db
      .collection<DuelResultDocument>("duel_results")
      .find(
        { players: player.id } as Filter<DuelResultDocument>,
        { projection: { winnerId: 1 } }
      )
      .sort({ createdAt: 1 })
      .toArray()
  ]);

  return summarizePlayerCareer(localMatches, duels, player.id);
}

export async function loadPlayerHistory(
  db: Db,
  player: PlayerIdentity,
  limit: number,
  before?: Date
): Promise<{ matches: PlayerCareerMatch[]; nextCursor: string | null }> {
  const createdAt = before ? { $lt: before } : undefined;
  const [localMatches, duels] = await Promise.all([
    db
      .collection<LocalMatchDocument>("matches")
      .find(
        {
          accountId: accountFilter(player),
          mode: "player-vs-bot",
          ...(createdAt ? { createdAt } : {})
        } as Filter<LocalMatchDocument>
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray(),
    db
      .collection<DuelResultDocument>("duel_results")
      .find(
        {
          players: player.id,
          ...(createdAt ? { createdAt } : {})
        } as Filter<DuelResultDocument>
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray()
  ]);
  const opponentIds = Array.from(
    new Set(duels.flatMap((duel) => duel.players.filter((id) => id && id !== player.id)))
  );
  const opponentProfiles = opponentIds.length
    ? await db
        .collection<ProfileIdentityDocument>("player_profiles")
        .find(
          { playerId: { $in: opponentIds } },
          { projection: { playerId: 1, "identity.displayName": 1 } }
        )
        .toArray()
    : [];
  const opponentNames = new Map(
    opponentProfiles.map((profile) => [profile.playerId, profile.identity?.displayName])
  );
  const history = [
    ...localMatches.map<PlayerCareerMatch>((match) => ({
      id: `local-${match._id.toString()}`,
      kind: "local",
      result: localResult(match.winner),
      opponentName: "Arena Bot",
      durationMs: match.durationMs,
      score: match.score,
      reason: null,
      playedAt: match.createdAt.toISOString()
    })),
    ...duels.map<PlayerCareerMatch>((duel) => {
      const opponentId = duel.players.find((id) => id && id !== player.id);

      return {
        id: `duel-${duel.roundId}`,
        kind: "duel",
        result: duelResult(duel.winnerId, player.id),
        opponentName: (opponentId && opponentNames.get(opponentId)) || "Discord Rival",
        durationMs: duel.durationMs,
        score: null,
        reason: duel.reason,
        playedAt: duel.createdAt.toISOString()
      };
    })
  ]
    .sort((left, right) => right.playedAt.localeCompare(left.playedAt))
    .slice(0, limit);

  return {
    matches: history,
    nextCursor: history.length === limit ? history.at(-1)?.playedAt ?? null : null
  };
}
