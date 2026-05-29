import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

type MatchPayload = {
  winner?: "player" | "bot" | "draw";
  durationMs?: number;
  blocksCleared?: number;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as MatchPayload;

  const match = {
    mode: "bot-skirmish",
    winner: payload.winner ?? "draw",
    durationMs: payload.durationMs ?? 0,
    blocksCleared: payload.blocksCleared ?? 0,
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
