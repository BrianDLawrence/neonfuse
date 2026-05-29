import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

export async function GET() {
  if (!process.env.MONGODB_URI) {
    return NextResponse.json({
      ok: true,
      mongo: "not-configured"
    });
  }

  const db = await getMongoDb();
  await db.command({ ping: 1 });

  return NextResponse.json({
    ok: true,
    mongo: "connected"
  });
}
