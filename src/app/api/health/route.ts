import { NextResponse } from "next/server";
import { tryGetMongoDb } from "@/lib/mongodb";

export async function GET() {
  const { db, error, mongo } = await tryGetMongoDb();

  if (!db) {
    return NextResponse.json(
      {
        ok: mongo === "not-configured",
        mongo,
        error
      },
      { status: mongo === "not-configured" ? 200 : 503 }
    );
  }

  await db.command({ ping: 1 });

  return NextResponse.json({ ok: true, mongo });
}
