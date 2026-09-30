import { createHmac, randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import { NextResponse } from "next/server";
import { tryGetMongoDb } from "@/lib/mongodb";

const RATE_LIMIT_COLLECTION = "rate_limits";
const MAX_LOCAL_BUCKETS = 5_000;
const ephemeralSecret = randomBytes(32).toString("base64url");

// Discord's Activity proxy hides player IP addresses, so every request made
// inside the Activity arrives from a shared pool of Discord proxy addresses.
// Bearer-authenticated (Activity) requests are limited per session token, with a
// looser per-address ceiling that still caps floods of forged tokens.
const SHARED_ADDRESS_MULTIPLIER = 25;

const RATE_LIMIT_POLICIES = {
  // Runs before a bearer token exists and only inside Discord, so everyone
  // launching the Activity through the same proxy address shares this bucket.
  activitySession: { limit: 120, windowMs: 60_000 },
  authRead: { limit: 180, windowMs: 60_000 },
  authWrite: { limit: 20, windowMs: 10 * 60_000 },
  highScoreWrite: { limit: 30, windowMs: 60_000 },
  matchWrite: { limit: 30, windowMs: 60_000 },
  multiplayerTicket: { limit: 30, windowMs: 60_000 },
  musicTrackWrite: { limit: 10, windowMs: 60 * 60_000 },
  profileWrite: { limit: 120, windowMs: 60_000 },
  socialParty: { limit: 60, windowMs: 60_000 },
  visitorWrite: { limit: 30, windowMs: 60_000 }
} as const;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

type RateLimitDocument = {
  _id: string;
  count: number;
  createdAt: Date;
  expiresAt: Date;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type LocalBucket = {
  count: number;
  expiresAt: number;
};

const globalRateLimitState = globalThis as typeof globalThis & {
  neonFuseRateLimitBuckets?: Map<string, LocalBucket>;
  neonFuseRateLimitIndex?: Promise<void>;
};

function localBuckets() {
  globalRateLimitState.neonFuseRateLimitBuckets ??= new Map<string, LocalBucket>();
  return globalRateLimitState.neonFuseRateLimitBuckets;
}

function rateLimitSecret() {
  return [process.env.RATE_LIMIT_SECRET, process.env.BETTER_AUTH_SECRET].find(
    (secret) => secret && secret.length >= 32
  ) ?? ephemeralSecret;
}

function clientAddress(request: Request): string {
  const vercelForwardedFor = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")
    .at(-1)
    ?.trim();

  if (vercelForwardedFor) {
    return vercelForwardedFor;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();

  if (realIp) {
    return realIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwardedFor || "unknown-client";
}

function bearerToken(request: Request): string | null {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() || null;
}

function bucketId(policyName: RateLimitPolicyName, clientKey: string, windowStart: number) {
  // Only a keyed digest is stored; raw addresses and tokens never leave memory.
  return createHmac("sha256", rateLimitSecret())
    .update(`${policyName}:${clientKey}:${windowStart}`)
    .digest("hex");
}

function pruneLocalBuckets(now: number) {
  const buckets = localBuckets();

  if (buckets.size < MAX_LOCAL_BUCKETS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) {
      buckets.delete(key);
    }
  }

  while (buckets.size >= MAX_LOCAL_BUCKETS) {
    const oldestKey = buckets.keys().next().value;

    if (!oldestKey) {
      break;
    }

    buckets.delete(oldestKey);
  }
}

function consumeLocal(id: string, limit: number, resetAt: number, now: number): RateLimitResult {
  pruneLocalBuckets(now);
  const buckets = localBuckets();
  const current = buckets.get(id);
  const count = current && current.expiresAt > now ? current.count + 1 : 1;
  buckets.set(id, { count, expiresAt: resetAt });

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt
  };
}

async function ensureRateLimitIndex(db: Db) {
  if (!globalRateLimitState.neonFuseRateLimitIndex) {
    const indexPromise = db
      .collection<RateLimitDocument>(RATE_LIMIT_COLLECTION)
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .then(() => undefined);
    const retryableIndexPromise = indexPromise.catch((error) => {
      if (globalRateLimitState.neonFuseRateLimitIndex === retryableIndexPromise) {
        globalRateLimitState.neonFuseRateLimitIndex = undefined;
      }

      throw error;
    });

    globalRateLimitState.neonFuseRateLimitIndex = retryableIndexPromise;
  }

  await globalRateLimitState.neonFuseRateLimitIndex;
}

async function consumeShared(
  db: Db,
  id: string,
  limit: number,
  resetAt: number,
  now: number
): Promise<RateLimitResult> {
  await ensureRateLimitIndex(db);
  const bucket = await db.collection<RateLimitDocument>(RATE_LIMIT_COLLECTION).findOneAndUpdate(
    { _id: id },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        createdAt: new Date(now),
        expiresAt: new Date(resetAt)
      }
    },
    {
      includeResultMetadata: false,
      returnDocument: "after",
      upsert: true
    }
  );
  const count = bucket?.count ?? 1;

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt
  };
}

async function consume(
  id: string,
  limit: number,
  resetAt: number,
  now: number
): Promise<RateLimitResult> {
  const localResult = consumeLocal(id, limit, resetAt, now);

  if (!localResult.allowed) {
    return localResult;
  }

  try {
    const { db } = await tryGetMongoDb();
    return db ? await consumeShared(db, id, limit, resetAt, now) : localResult;
  } catch {
    return localResult;
  }
}

export async function checkRateLimit(
  request: Request,
  policyName: RateLimitPolicyName,
  now = Date.now()
): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[policyName];
  const windowStart = Math.floor(now / policy.windowMs) * policy.windowMs;
  const resetAt = windowStart + policy.windowMs;
  const address = `address:${clientAddress(request)}`;
  const token = bearerToken(request);
  const buckets = token
    ? [
        { clientKey: `session:${token}`, limit: policy.limit },
        { clientKey: address, limit: policy.limit * SHARED_ADDRESS_MULTIPLIER }
      ]
    : [{ clientKey: address, limit: policy.limit }];
  let tightest: RateLimitResult | undefined;

  for (const bucket of buckets) {
    const result = await consume(
      bucketId(policyName, bucket.clientKey, windowStart),
      bucket.limit,
      resetAt,
      now
    );

    if (!result.allowed) {
      return result;
    }

    if (!tightest || result.remaining < tightest.remaining) {
      tightest = result;
    }
  }

  return tightest ?? { allowed: true, limit: policy.limit, remaining: policy.limit, resetAt };
}

export async function enforceRateLimit(
  request: Request,
  policyName: RateLimitPolicyName
): Promise<NextResponse | null> {
  const result = await checkRateLimit(request, policyName);

  if (result.allowed) {
    return null;
  }

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000));

  return NextResponse.json(
    { ok: false, error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000))
      }
    }
  );
}
