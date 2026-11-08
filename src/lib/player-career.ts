import type { Db, Filter } from "mongodb";
import {
  deriveCampaignProgress,
  getCampaignStage,
  getStageOpponents,
  type CampaignProgress
} from "@/game/simulation/campaign";
import { deriveDailyProgress, getDailyChallenge, getDailyOpponents, type DailyProgress } from "@/game/simulation/daily";
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

/**
 * A row of `duel_results`. Party Brawl rounds share the collection (and its unique
 * round ID, deletion and roster queries) but carry `mode: "party"`; they are never
 * counted as duels, so a bot win (no winner ID) can never read as a duel draw.
 */
export type DuelCareerRecord = {
  winnerId: string | null;
  mode?: "party";
  outcome?: "human" | "bot" | "draw";
};

export const PARTY_SERIES_COLLECTION = "party_series";

function isPartyRound(record: DuelCareerRecord) {
  return record.mode === "party";
}

type LocalMatchDocument = LocalCareerRecord & {
  accountId: string;
  mode: "player-vs-bot" | "campaign" | "daily";
  stageId?: string;
  dateKey?: string;
  durationMs: number;
  blocksCleared: number;
  createdAt: Date;
};

// Campaign and Daily Fuse rounds are local matches too, so they count toward stats and XP.
export const LOCAL_MATCH_MODES = ["player-vs-bot", "campaign", "daily"] as const;
const LOCAL_MODES = { $in: [...LOCAL_MATCH_MODES] };

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

function partyResult(record: DuelCareerRecord, playerId: string): "win" | "loss" | "draw" {
  if (record.outcome === "draw") return "draw";
  return record.winnerId === playerId ? "win" : "loss";
}

export function summarizePlayerCareer(
  localMatches: LocalCareerRecord[],
  resultsOldestFirst: DuelCareerRecord[],
  playerId: string,
  partySeriesWins = 0
): PlayerCareerStats {
  const duelResults = resultsOldestFirst
    .filter((record) => !isPartyRound(record))
    .map((duel) => duelResult(duel.winnerId, playerId));
  const partyResults = resultsOldestFirst
    .filter(isPartyRound)
    .map((round) => partyResult(round, playerId));
  let streak = 0;
  let bestWinStreak = 0;

  for (const result of duelResults) {
    streak = result === "win" ? streak + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, streak);
  }

  return {
    local: tally(localMatches.map((match) => localResult(match.winner))),
    duel: tally(duelResults),
    party: tally(partyResults),
    partySeriesWins,
    bestScore: localMatches.reduce((best, match) => Math.max(best, match.score), 0),
    bestWinStreak
  };
}

function accountFilter(player: PlayerIdentity): string | { $in: string[] } {
  return player.legacyId ? { $in: [player.id, player.legacyId] } : player.id;
}

export async function loadPlayerCareer(db: Db, player: PlayerIdentity): Promise<PlayerCareerStats> {
  const [localMatches, duels, partySeriesWins] = await Promise.all([
    db
      .collection<LocalMatchDocument>("matches")
      .find(
        { accountId: accountFilter(player), mode: LOCAL_MODES } as Filter<LocalMatchDocument>,
        { projection: { winner: 1, score: 1 } }
      )
      .toArray(),
    db
      .collection<DuelResultDocument>("duel_results")
      .find(
        { players: player.id } as Filter<DuelResultDocument>,
        { projection: { winnerId: 1, mode: 1, outcome: 1 } }
      )
      .sort({ createdAt: 1 })
      .toArray(),
    db
      .collection(PARTY_SERIES_COLLECTION)
      .countDocuments({ "winner.kind": "human", "winner.playerId": player.id })
  ]);

  return summarizePlayerCareer(localMatches, duels, player.id, partySeriesWins);
}

function localOpponentName(match: Pick<LocalMatchDocument, "mode" | "stageId" | "dateKey">): string {
  const daily = match.mode === "daily" ? getDailyChallenge(match.dateKey) : null;

  if (daily) {
    return `Daily Fuse: ${getDailyOpponents(daily).map((bot) => bot.name).join(" + ")}`;
  }

  const stage = match.mode === "campaign" ? getCampaignStage(match.stageId) : null;
  return stage ? `Stage ${stage.id}: ${getStageOpponents(stage)[0].name}` : "Arena Bot";
}

/**
 * Derives campaign progress from the player's stored campaign wins rather than a
 * stored counter, so retries and replays can never double count.
 */
export async function loadCampaignProgress(db: Db, player: PlayerIdentity): Promise<CampaignProgress> {
  const wins = await db
    .collection<LocalMatchDocument>("matches")
    .find(
      { accountId: accountFilter(player), mode: "campaign", winner: "player" } as Filter<LocalMatchDocument>,
      { projection: { stageId: 1, winner: 1, durationMs: 1, blocksCleared: 1 } }
    )
    .sort({ createdAt: 1 })
    .toArray();

  return deriveCampaignProgress(
    wins.map((match) => ({
      stageId: String(match.stageId ?? ""),
      winner: match.winner,
      durationMs: Number(match.durationMs),
      blocksCleared: Number(match.blocksCleared)
    }))
  );
}

/**
 * Derives the Daily Fuse streak from the player's stored daily wins, the same way
 * campaign progress is derived, so replays never double count a day.
 */
export async function loadDailyProgress(db: Db, player: PlayerIdentity): Promise<DailyProgress> {
  const wins = await db
    .collection<LocalMatchDocument>("matches")
    .find(
      { accountId: accountFilter(player), mode: "daily", winner: "player" } as Filter<LocalMatchDocument>,
      { projection: { dateKey: 1, durationMs: 1 } }
    )
    .sort({ createdAt: 1 })
    .toArray();

  return deriveDailyProgress(
    wins.map((match) => ({ dateKey: String(match.dateKey ?? ""), durationMs: Number(match.durationMs) }))
  );
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
          mode: LOCAL_MODES,
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
    new Set(duels.filter((duel) => !isPartyRound(duel)).flatMap((duel) => duel.players.filter((id) => id && id !== player.id)))
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
      opponentName: localOpponentName(match),
      durationMs: match.durationMs,
      score: match.score,
      reason: null,
      playedAt: match.createdAt.toISOString()
    })),
    ...duels.map<PlayerCareerMatch>((duel) => {
      if (isPartyRound(duel)) {
        return {
          id: `party-${duel.roundId}`,
          kind: "party",
          result: partyResult(duel, player.id),
          opponentName: "3 rivals",
          durationMs: duel.durationMs,
          score: null,
          reason: duel.reason,
          playedAt: duel.createdAt.toISOString()
        };
      }
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
