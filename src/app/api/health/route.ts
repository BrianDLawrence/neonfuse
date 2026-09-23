import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth";
import { tryGetMongoDb } from "@/lib/mongodb";
import { reportOperationalError } from "@/lib/server-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckState = "ready" | "not-configured" | "unavailable";

function configured(values: Array<string | undefined>): CheckState {
  return values.every(Boolean) ? "ready" : "not-configured";
}

async function databaseState(): Promise<CheckState> {
  const { db, mongo } = await tryGetMongoDb();

  if (!db) {
    return mongo === "unavailable" ? "unavailable" : "not-configured";
  }

  try {
    await db.command({ ping: 1 });
    return "ready";
  } catch (error) {
    reportOperationalError(
      {
        service: "web",
        event: "health.database.failed",
        summary: "The application database health probe failed"
      },
      error
    );
    return "unavailable";
  }
}

export async function GET() {
  const checks = {
    database: await databaseState(),
    authentication: isAuthConfigured() ? "ready" : "not-configured",
    discordActivity: configured([
      process.env.DISCORD_CLIENT_ID,
      process.env.DISCORD_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
    ]),
    multiplayerAdmission: configured([
      process.env.MULTIPLAYER_SECRET && process.env.MULTIPLAYER_SECRET.length >= 32
        ? process.env.MULTIPLAYER_SECRET
        : undefined,
      process.env.DISCORD_BOT_TOKEN
    ])
  } satisfies Record<string, CheckState>;
  const ok = Object.values(checks).every((state) => state === "ready");

  return NextResponse.json(
    {
      ok,
      service: "neon-fuse-web",
      status: ok ? "ready" : "unready",
      checks,
      timestamp: new Date().toISOString()
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
