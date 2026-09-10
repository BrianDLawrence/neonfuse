import { createHash, randomBytes } from "node:crypto";
import type { Collection } from "mongodb";
import { getMongoClient } from "@/lib/mongodb";

const ACTIVITY_SESSION_LIFETIME_SECONDS = 60 * 60;

interface ActivitySessionDocument {
  tokenHash: string;
  playerId: string;
  legacyPlayerId?: string;
  discordUserId: string;
  displayName: string;
  instanceId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface ActivitySessionIdentity {
  playerId: string;
  legacyPlayerId?: string;
  discordUserId: string;
  displayName: string;
  instanceId: string;
}

const globalActivitySessions = globalThis as typeof globalThis & {
  neonFuseActivitySessionIndexes?: Promise<void>;
};

function collection(): Collection<ActivitySessionDocument> {
  return getMongoClient()
    .db(process.env.MONGODB_DB ?? "neon-fuse")
    .collection<ActivitySessionDocument>("activity_sessions");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function ensureIndexes() {
  if (!globalActivitySessions.neonFuseActivitySessionIndexes) {
    const indexPromise = Promise.all([
      collection().createIndex({ tokenHash: 1 }, { unique: true }),
      collection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    ]).then(() => undefined);
    const retryableIndexPromise = indexPromise.catch((error) => {
      if (globalActivitySessions.neonFuseActivitySessionIndexes === retryableIndexPromise) {
        globalActivitySessions.neonFuseActivitySessionIndexes = undefined;
      }

      throw error;
    });

    globalActivitySessions.neonFuseActivitySessionIndexes = retryableIndexPromise;
  }

  return globalActivitySessions.neonFuseActivitySessionIndexes;
}

export async function createActivitySession(
  identity: ActivitySessionIdentity,
  discordExpiresInSeconds: number
): Promise<{ token: string; expiresIn: number }> {
  await ensureIndexes();

  const expiresIn = Math.max(
    60,
    Math.min(discordExpiresInSeconds, ACTIVITY_SESSION_LIFETIME_SECONDS)
  );
  const token = randomBytes(32).toString("base64url");
  const now = new Date();

  await collection().insertOne({
    tokenHash: hashToken(token),
    ...identity,
    createdAt: now,
    expiresAt: new Date(now.getTime() + expiresIn * 1_000)
  });

  return { token, expiresIn };
}

export async function findActivitySession(token: string): Promise<ActivitySessionIdentity | null> {
  if (token.length < 32 || token.length > 256) {
    return null;
  }

  const session = await collection().findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() }
  });

  if (!session) {
    return null;
  }

  return {
    playerId: session.playerId,
    legacyPlayerId: session.legacyPlayerId,
    discordUserId: session.discordUserId,
    displayName: session.displayName,
    instanceId: session.instanceId
  };
}
