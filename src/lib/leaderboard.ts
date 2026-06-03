import type { Db, Document } from "mongodb";
import type { HighScoreMode } from "./schemas/high-score";

export type HighScoreEntry = {
  rank: number;
  matchId: string;
  visitorId: string;
  initials: string;
  score: number;
  mode: "player-vs-bot" | "bot-skirmish";
  winner: "player" | "bot" | "bot-a" | "bot-b" | "draw";
  durationMs: number;
  blocksCleared: number;
  createdAt: string;
};

const SCORE_PROJECTION = {
  _id: 0,
  matchId: 1,
  visitorId: 1,
  initials: 1,
  score: 1,
  mode: 1,
  winner: 1,
  durationMs: 1,
  blocksCleared: 1,
  createdAt: 1
};

function toHighScoreEntry(score: Document, index: number): HighScoreEntry {
  const createdAt = score.createdAt instanceof Date ? score.createdAt.toISOString() : String(score.createdAt);

  return {
    rank: index + 1,
    matchId: String(score.matchId),
    visitorId: String(score.visitorId),
    initials: String(score.initials),
    score: Number(score.score),
    mode: score.mode === "bot-skirmish" ? "bot-skirmish" : "player-vs-bot",
    winner: ["player", "bot", "bot-a", "bot-b", "draw"].includes(String(score.winner))
      ? (score.winner as HighScoreEntry["winner"])
      : "draw",
    durationMs: Number(score.durationMs),
    blocksCleared: Number(score.blocksCleared),
    createdAt
  };
}

export async function fetchHighScores(db: Db, mode: HighScoreMode, limit: number) {
  const query = mode === "all" ? {} : { mode };
  const scores = await db
    .collection("high-scores")
    .find(query, { projection: SCORE_PROJECTION })
    .sort({ score: -1, createdAt: 1 })
    .limit(limit)
    .toArray();

  return scores.map(toHighScoreEntry);
}

export async function wouldQualifyForLeaderboard(db: Db, mode: HighScoreMode, score: number, limit: number) {
  const scores = await fetchHighScores(db, mode, limit);
  const lowestScore = scores.at(-1)?.score ?? 0;

  return scores.length < limit || score >= lowestScore;
}
