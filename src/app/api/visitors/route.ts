import { NextResponse } from "next/server";
import { tryGetMongoDb } from "@/lib/mongodb";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { visitorRequestSchema } from "@/lib/schemas/visitor";

const VISITOR_COOKIE = "nf_vid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  const player = await getAuthenticatedPlayer(request);

  if (!player) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = visitorRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid visitor payload"
      },
      { status: 400 }
    );
  }

  const visitorId = parsed.data.visitorId ?? crypto.randomUUID();
  const now = new Date();

  const responseBody = {
    ok: true,
    stored: false,
    mongo: "not-configured",
    visitorId
  };

  const { db, mongo } = await tryGetMongoDb();
  responseBody.mongo = mongo;

  if (db) {
    await ensureGameIndexes(db);
    await db.collection("visitors").updateOne(
      { visitorId },
      {
        $set: { accountId: player.id, lastSeenAt: now },
        $setOnInsert: {
          visitorId,
          createdAt: now,
          matchesPlayed: 0,
          bestScore: 0
        }
      },
      { upsert: true }
    );
    responseBody.stored = true;
  }

  const response = NextResponse.json(responseBody);
  response.cookies.set(VISITOR_COOKIE, visitorId, {
    httpOnly: false,
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  return response;
}
