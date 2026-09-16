import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { getAuthenticatedPlayer, type PlayerIdentity } from "@/lib/player-identity";
import { loadPlayerCareer } from "@/lib/player-career";
import { getOrCreatePlayerProfile, updatePlayerProfile } from "@/lib/player-profiles";
import { playerProfilePatchSchema } from "@/lib/schemas/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthenticatedContext =
  | { ok: true; player: PlayerIdentity; db: Db }
  | { ok: false; response: NextResponse };

async function authenticatedContext(request: Request): Promise<AuthenticatedContext> {
  const player = await getAuthenticatedPlayer(request);

  if (!player) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 })
    };
  }

  const { db, mongo } = await tryGetMongoDb();

  if (!db) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Profile storage is unavailable", mongo },
        { status: 503 }
      )
    };
  }

  await ensureGameIndexes(db);
  return { ok: true, player, db };
}

export async function GET(request: Request) {
  const context = await authenticatedContext(request);

  if (!context.ok) {
    return context.response;
  }

  const result = await getOrCreatePlayerProfile(context.db, context.player);
  const stats = await loadPlayerCareer(context.db, context.player);
  return NextResponse.json({
    ok: true,
    ...result,
    profile: { ...result.profile, stats }
  });
}

export async function PATCH(request: Request) {
  const context = await authenticatedContext(request);

  if (!context.ok) {
    return context.response;
  }

  const parsed = playerProfilePatchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid profile update" },
      { status: 400 }
    );
  }

  const profile = await updatePlayerProfile(context.db, context.player, parsed.data);
  return NextResponse.json({ ok: true, profile });
}
