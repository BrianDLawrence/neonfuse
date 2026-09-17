import { NextResponse } from "next/server";
import { findActivitySession } from "@/lib/activity-session";
import { verifyDiscordActivityInstance } from "@/lib/discord-activity-instance";
import { signJoinTicket } from "@/lib/multiplayer-ticket";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "multiplayerTicket");
  if (limited) return limited;

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
    const ticket = signJoinTicket({ playerId: identity.playerId, name: identity.displayName.slice(0, 100), roomId: identity.instanceId }, secret, Date.now());
    return NextResponse.json({ ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Party connection unavailable. Please try again." }, { status: 503 });
  }
}
