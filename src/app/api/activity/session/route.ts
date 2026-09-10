import { NextResponse } from "next/server";
import { z } from "zod";
import { createActivitySession } from "@/lib/activity-session";
import { discordPlayerId } from "@/lib/discord-identity";
import { findBetterAuthUserId } from "@/lib/player-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activityRequestSchema = z.object({
  code: z.string().min(1).max(2_048),
  instanceId: z.string().min(1).max(256)
});

const discordTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  token_type: z.string().min(1)
});

const discordUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  global_name: z.string().nullable().optional()
});

function activityServerIsConfigured(): boolean {
  return Boolean(
    process.env.MONGODB_URI &&
      process.env.DISCORD_CLIENT_ID &&
      process.env.DISCORD_CLIENT_SECRET
  );
}

export async function POST(request: Request) {
  try {
    if (!activityServerIsConfigured()) {
      return NextResponse.json(
        { error: "Discord Activity authentication is not configured." },
        { status: 503 }
      );
    }

    const parsed = activityRequestSchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid Discord authorization code is required." },
        { status: 400 }
      );
    }

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code: parsed.data.code
      }),
      cache: "no-store"
    });
    const tokenPayload = discordTokenSchema.safeParse(
      await tokenResponse.json().catch(() => null)
    );

    if (!tokenResponse.ok || !tokenPayload.success) {
      return NextResponse.json(
        { error: "Discord rejected the Activity authorization code." },
        { status: 401 }
      );
    }

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        authorization: `${tokenPayload.data.token_type} ${tokenPayload.data.access_token}`
      },
      cache: "no-store"
    });
    const userPayload = discordUserSchema.safeParse(
      await userResponse.json().catch(() => null)
    );

    if (!userResponse.ok || !userPayload.success) {
      return NextResponse.json(
        { error: "Discord identity verification failed." },
        { status: 401 }
      );
    }

    const displayName = userPayload.data.global_name || userPayload.data.username;
    const playerId = discordPlayerId(userPayload.data.id);
    const legacyPlayerId = await findBetterAuthUserId(userPayload.data.id);
    const activitySession = await createActivitySession(
      {
        playerId,
        legacyPlayerId,
        discordUserId: userPayload.data.id,
        displayName,
        instanceId: parsed.data.instanceId
      },
      tokenPayload.data.expires_in
    );

    return NextResponse.json({
      accessToken: tokenPayload.data.access_token,
      sessionToken: activitySession.token,
      expiresIn: activitySession.expiresIn,
      player: { displayName }
    });
  } catch (error) {
    console.error("Discord Activity session creation failed", error);
    return NextResponse.json(
      { error: "The Discord gateway is temporarily unavailable." },
      { status: 500 }
    );
  }
}
