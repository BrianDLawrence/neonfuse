import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { fetchHighScores, wouldQualifyForLeaderboard } from "@/lib/leaderboard";
import { tryGetMongoDb } from "@/lib/mongodb";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { highScoreModeSchema, highScoreSubmitSchema } from "@/lib/schemas/high-score";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function readLimit(searchParams: URLSearchParams) {
  const value = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);

  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.round(value)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = highScoreModeSchema.safeParse(url.searchParams.get("mode") ?? "all");

  if (!mode.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid high-score mode"
      },
      { status: 400 }
    );
  }

  const { db, mongo } = await tryGetMongoDb();

  if (!db) {
    return NextResponse.json({
      ok: true,
      stored: false,
      mongo,
      mode: mode.data,
      scores: []
    });
  }

  await ensureGameIndexes(db);
  const scores = await fetchHighScores(db, mode.data, readLimit(url.searchParams));

  return NextResponse.json({
    ok: true,
    stored: true,
    mode: mode.data,
    scores
  });
}

export async function POST(request: Request) {
  const session = await getAuthSession(request);

  if (!session) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

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

  const parsed = highScoreSubmitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid high-score payload"
      },
      { status: 400 }
    );
  }

  if (!ObjectId.isValid(parsed.data.matchId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unknown match"
      },
      { status: 404 }
    );
  }

  const { db, mongo } = await tryGetMongoDb();

  if (!db) {
    return NextResponse.json({
      ok: true,
      stored: false,
      mongo,
      entry: {
        matchId: parsed.data.matchId,
        visitorId: parsed.data.visitorId,
        initials: parsed.data.initials
      },
      scores: []
    });
  }

  await ensureGameIndexes(db);

  const match = await db.collection("matches").findOne({
    _id: new ObjectId(parsed.data.matchId),
    accountId: session.user.id
  });

  if (!match) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unknown match"
      },
      { status: 404 }
    );
  }

  const entry = {
    accountId: session.user.id,
    matchId: parsed.data.matchId,
    visitorId: String(match.visitorId),
    initials: parsed.data.initials,
    score: Number(match.score),
    mode: match.mode,
    winner: match.winner,
    durationMs: Number(match.durationMs),
    blocksCleared: Number(match.blocksCleared),
    createdAt: match.createdAt instanceof Date ? match.createdAt : new Date()
  };

  await db.collection("high-scores").updateOne(
    { matchId: parsed.data.matchId },
    {
      $set: entry
    },
    { upsert: true }
  );
  await db.collection("visitors").updateOne(
    { visitorId: parsed.data.visitorId },
    {
      $set: {
        lastSeenAt: new Date(),
        lastInitials: parsed.data.initials
      },
      $max: { bestScore: entry.score }
    }
  );

  const scores = await fetchHighScores(db, "all", DEFAULT_LIMIT);
  const qualifiesForLeaderboard = await wouldQualifyForLeaderboard(db, "all", entry.score, DEFAULT_LIMIT);

  return NextResponse.json({
    ok: true,
    stored: true,
    entry,
    qualifiesForLeaderboard,
    scores
  });
}
