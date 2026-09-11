import { NextResponse } from "next/server";
import { z } from "zod";
import { findActivitySession } from "@/lib/activity-session";
import { signJoinTicket } from "@/lib/multiplayer-ticket";

export const runtime = "nodejs";
const instanceSchema = z.object({ application_id: z.string(), instance_id: z.string(), users: z.array(z.string()) });

export async function POST(request: Request) {
  const secret = process.env.MULTIPLAYER_SECRET;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!secret || secret.length < 32 || !botToken || !clientId) {
    return NextResponse.json({ error: "Friend matches are not configured yet." }, { status: 503 });
  }
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return NextResponse.json({ error: "Open Neon Fuse inside Discord to play with a friend." }, { status: 401 });
  try {
    const identity = await findActivitySession(token);
    if (!identity) return NextResponse.json({ error: "Your session expired. Reopen the Activity." }, { status: 401 });
    const response = await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(clientId)}/activity-instances/${encodeURIComponent(identity.instanceId)}`, {
      headers: { Authorization: `Bot ${botToken}` }, cache: "no-store", signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return NextResponse.json({ error: "Unable to verify this Discord party. Please try again." }, { status: response.status === 429 ? 429 : 403 });
    const instance = instanceSchema.safeParse(await response.json());
    if (!instance.success || instance.data.application_id !== clientId || instance.data.instance_id !== identity.instanceId || !instance.data.users.includes(identity.discordUserId)) {
      return NextResponse.json({ error: "Join the same Discord Activity as your friend first." }, { status: 403 });
    }
    const ticket = signJoinTicket({ playerId: identity.playerId, name: identity.displayName.slice(0, 100), roomId: identity.instanceId }, secret, Date.now());
    return NextResponse.json({ ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Party connection unavailable. Please try again." }, { status: 503 });
  }
}
