import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";
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

  const match = {
    mode: "bot-skirmish",
    winner: payload.winner,
    durationMs: payload.durationMs,
    blocksCleared: payload.blocksCleared,
    createdAt: new Date()
  };

  if (!process.env.MONGODB_URI) {
    return NextResponse.json({
      ok: true,
      stored: false,
      match
    });
  }

  const db = await getMongoDb();
  const result = await db.collection("matches").insertOne(match);

  return NextResponse.json({
    ok: true,
    stored: true,
    id: result.insertedId.toString()
  });
}
