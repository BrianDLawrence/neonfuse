import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth";
import { tryGetMongoDb } from "@/lib/mongodb";

export async function GET() {
  const { db, error, mongo } = await tryGetMongoDb();

  if (!db) {
    return NextResponse.json(
      {
        ok: mongo === "not-configured",
        mongo,
        authentication: isAuthConfigured() ? "configured" : "not-configured",
        error
      },
      { status: mongo === "not-configured" ? 200 : 503 }
    );
  }

  await db.command({ ping: 1 });

  return NextResponse.json({
    ok: true,
    mongo,
    authentication: isAuthConfigured() ? "configured" : "not-configured"
  });
}
