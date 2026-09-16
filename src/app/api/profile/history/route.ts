import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { loadPlayerCareer, loadPlayerHistory } from "@/lib/player-career";
import { getAuthenticatedPlayer } from "@/lib/player-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(6),
  before: z.string().datetime().optional()
});

export async function GET(request: Request) {
  const player = await getAuthenticatedPlayer(request);

  if (!player) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = historyQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    before: url.searchParams.get("before") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid history query" }, { status: 400 });
  }

  const { db, mongo } = await tryGetMongoDb();

  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Career history is unavailable", mongo },
      { status: 503 }
    );
  }

  await ensureGameIndexes(db);
  const [stats, history] = await Promise.all([
    loadPlayerCareer(db, player),
    loadPlayerHistory(
      db,
      player,
      parsed.data.limit,
      parsed.data.before ? new Date(parsed.data.before) : undefined
    )
  ]);

  return NextResponse.json({ ok: true, stats, ...history });
}
