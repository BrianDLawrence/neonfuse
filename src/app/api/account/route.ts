import { NextResponse } from "next/server";
import { tryGetMongoDb } from "@/lib/mongodb";
import { deletePlayerData } from "@/lib/player-data-deletion";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { accountDeletionSchema } from "@/lib/schemas/account-deletion";
import { reportOperationalError } from "@/lib/server-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_COOKIE_NAMES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth.session_data",
  "__Secure-better-auth.session_data"
];

export async function DELETE(request: Request) {
  const player = await getAuthenticatedPlayer(request);

  if (!player) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const parsed = accountDeletionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Type DELETE MY DATA to confirm deletion" },
      { status: 400 }
    );
  }

  const { db, mongo } = await tryGetMongoDb();

  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Account storage is unavailable", mongo },
      { status: 503 }
    );
  }

  try {
    await deletePlayerData(db, player);
  } catch (error) {
    reportOperationalError(
      {
        service: "web",
        event: "account.deletion.failed",
        summary: "Account data deletion failed"
      },
      error
    );
    return NextResponse.json(
      { ok: false, error: "Account data could not be deleted" },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ ok: true, deleted: true });
  response.headers.set("Cache-Control", "no-store");

  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}
