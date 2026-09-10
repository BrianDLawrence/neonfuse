import { getAuthSession } from "@/lib/auth";
import { findActivitySession } from "@/lib/activity-session";
import { discordPlayerId } from "@/lib/discord-identity";
import { getMongoClient } from "@/lib/mongodb";

interface BetterAuthAccount {
  accountId: string;
  providerId: string;
  userId: string;
}

export interface PlayerIdentity {
  id: string;
  legacyId?: string;
  displayName: string;
  source: "web" | "discord-activity";
  instanceId?: string;
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization ? /^Bearer\s+(.+)$/i.exec(authorization) : null;

  return match?.[1]?.trim() || null;
}

export async function findBetterAuthUserId(discordUserId: string): Promise<string | undefined> {
  const account = await getMongoClient()
    .db(process.env.MONGODB_DB ?? "neon-fuse")
    .collection<BetterAuthAccount>("account")
    .findOne({ providerId: "discord", accountId: discordUserId });

  return account?.userId;
}

export async function getAuthenticatedPlayer(request: Request): Promise<PlayerIdentity | null> {
  const token = bearerToken(request);

  if (token) {
    const session = await findActivitySession(token);

    if (!session) {
      return null;
    }

    return {
      id: session.playerId,
      legacyId: session.legacyPlayerId,
      displayName: session.displayName,
      source: "discord-activity",
      instanceId: session.instanceId
    };
  }

  const session = await getAuthSession(request);

  if (!session) {
    return null;
  }

  const account = await getMongoClient()
    .db(process.env.MONGODB_DB ?? "neon-fuse")
    .collection<BetterAuthAccount>("account")
    .findOne({ providerId: "discord", userId: session.user.id });

  return {
    id: account ? discordPlayerId(account.accountId) : session.user.id,
    legacyId: account ? session.user.id : undefined,
    displayName: session.user.name || session.user.email,
    source: "web"
  };
}
