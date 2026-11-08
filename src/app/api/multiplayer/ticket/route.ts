import { NextResponse } from "next/server";
import { findActivitySession } from "@/lib/activity-session";
import { verifyDiscordActivityInstance } from "@/lib/discord-activity-instance";
import { signJoinTicket } from "@/lib/multiplayer-ticket";
import { multiplayerTicketRequestSchema, type MultiplayerTicketRequest } from "@/lib/schemas/multiplayer";
import { enforceRateLimit } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/server-observability";

export const runtime = "nodejs";

/** The body is optional: an empty one is the duel, as older clients send. */
async function readTicketRequest(request: Request): Promise<MultiplayerTicketRequest | null> {
  const text = await request.text().catch(() => "");
  if (!text.trim()) return { mode: "duel" };
  try {
    const parsed = multiplayerTicketRequestSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "multiplayerTicket");
  if (limited) return limited;
  const body = await readTicketRequest(request);
  if (!body) return NextResponse.json({ ok: false, error: "Choose a duel or a party lobby." }, { status: 400 });

  const secret = process.env.MULTIPLAYER_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "Friend matches are not configured yet." }, { status: 503 });
  }
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return NextResponse.json({ error: "Open Neon Fuse inside Discord to play with a friend." }, { status: 401 });
  try {
    const identity = await findActivitySession(token);
    if (!identity) return NextResponse.json({ error: "Your session expired. Reopen the Activity." }, { status: 401 });
    const instance = await verifyDiscordActivityInstance(identity);
    if (!instance.ok) {
      return NextResponse.json({ error: instance.error }, { status: instance.status });
    }
    const ticket = signJoinTicket({
      playerId: identity.playerId,
      name: identity.displayName.slice(0, 100),
      roomId: identity.instanceId,
      ...(body.mode === "party" ? { mode: "party" as const } : {})
    }, secret, Date.now());
    return NextResponse.json({ ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    reportOperationalError(
      {
        service: "web",
        event: "multiplayer.ticket.failed",
        summary: "Multiplayer admission ticket creation failed"
      },
      error
    );
    return NextResponse.json({ error: "Party connection unavailable. Please try again." }, { status: 503 });
  }
}
