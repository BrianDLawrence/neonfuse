import { NextResponse } from "next/server";
import { calculateRoundScore } from "@/game/simulation/scoring";
import { fetchHighScores, wouldQualifyForLeaderboard } from "@/lib/leaderboard";
import { tryGetMongoDb } from "@/lib/mongodb";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { matchResultSchema } from "@/lib/schemas/match";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON payload"
      },
      { status: 400 }
    );
  }

  const parsed = matchResultSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid match result payload"
      },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const score = calculateRoundScore(payload);

  const match = {
    visitorId: payload.visitorId,
    mode: payload.mode,
    winner: payload.winner,
    durationMs: payload.durationMs,
    blocksCleared: payload.blocksCleared,
    score,
    createdAt: new Date()
  };

  const { db, mongo } = await tryGetMongoDb();

  if (!db) {
    return NextResponse.json({
      ok: true,
      stored: false,
      mongo,
      match,
      score,
      qualifiesForLeaderboard: true,
      topScores: []
    });
  }

  await ensureGameIndexes(db);
  const result = await db.collection("matches").insertOne(match);
  await db.collection("visitors").updateOne(
    { visitorId: payload.visitorId },
    {
      $set: { lastSeenAt: new Date() },
      $setOnInsert: {
        visitorId: payload.visitorId,
        createdAt: new Date()
      },
      $inc: { matchesPlayed: 1 },
      $max: { bestScore: score }
    },
    { upsert: true }
  );

  const topScores = await fetchHighScores(db, "all", 10);
  const qualifiesForLeaderboard = await wouldQualifyForLeaderboard(db, "all", score, 10);

  return NextResponse.json({
    ok: true,
    stored: true,
    matchId: result.insertedId.toString(),
    score,
    qualifiesForLeaderboard,
    topScores
  });
}
