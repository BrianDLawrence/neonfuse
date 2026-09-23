import { NextResponse } from "next/server";
import { findActivitySession } from "@/lib/activity-session";
import { verifyDiscordActivityInstance } from "@/lib/discord-activity-instance";
import { loadDiscordPartyRoster } from "@/lib/discord-party";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { enforceRateLimit } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/server-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request): string | null {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? null;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "socialParty");

  if (limited) {
    return limited;
  }

  const token = bearerToken(request);

  if (!token) {
    return NextResponse.json({ ok: false, error: "Discord Activity session required" }, { status: 401 });
  }

  try {
    const identity = await findActivitySession(token);

    if (!identity) {
      return NextResponse.json({ ok: false, error: "Activity session expired" }, { status: 401 });
    }

    const instance = await verifyDiscordActivityInstance(identity);

    if (!instance.ok) {
      return NextResponse.json({ ok: false, error: instance.error }, { status: instance.status });
    }

    const { db, mongo } = await tryGetMongoDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Party profiles are unavailable", mongo },
        { status: 503 }
      );
    }

    await ensureGameIndexes(db);
    const roster = await loadDiscordPartyRoster(
      db,
      identity.instanceId,
      instance.discordUserIds,
      identity.discordUserId
    );

    return NextResponse.json(
      { ok: true, roster },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    reportOperationalError(
      {
        service: "web",
        event: "social.party.failed",
        summary: "Discord party lookup failed"
      },
      error
    );
    return NextResponse.json(
      { ok: false, error: "Discord party is temporarily unavailable" },
      { status: 503 }
    );
  }
}
