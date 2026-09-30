import { MongoClient, type Collection, type Document } from "mongodb";
import { createRealtimeServer } from "./realtime";
import type { DuelResult } from "./rooms";
import {
  reportOperationalError,
  reportOperationalWarning
} from "../src/lib/server-observability";

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

async function main() {
  const secret = process.env.MULTIPLAYER_SECRET ?? "";
  const mongoUri = process.env.MONGODB_URI;
  let mongo: MongoClient | undefined;
  let results: Collection<Document> | undefined;
  let persistence: "connected" | "not-configured" | "unavailable" = mongoUri
    ? "unavailable"
    : "not-configured";
  if (mongoUri) {
    mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await mongo.connect();
    results = mongo.db(process.env.MONGODB_DB ?? "neon-fuse").collection("duel_results");
    await results.createIndex({ roundId: 1 }, { unique: true });
    persistence = "connected";
  } else {
    reportOperationalWarning({
      service: "realtime",
      event: "persistence.disabled",
      summary: "MONGODB_URI is not set; multiplayer results will not be persisted"
    });
  }
  const pending = new Map<string, DuelResult>();
  let writing = false;
  let lastPersistenceAlert = 0;
  async function flush() {
    if (writing || !results) return;
    writing = true;
    try {
      for (const result of pending.values()) {
        await results.updateOne({ roundId: result.roundId }, { $setOnInsert: { ...result, createdAt: new Date() } }, { upsert: true });
        pending.delete(result.roundId);
      }
      persistence = "connected";
    } catch (error) {
      persistence = "unavailable";
      const now = Date.now();
      if (now - lastPersistenceAlert >= 60_000) {
        lastPersistenceAlert = now;
        reportOperationalError(
          {
            service: "realtime",
            event: "result.persistence.failed",
            summary: "Multiplayer result storage is unavailable; queued results will retry",
            fields: { pendingResults: pending.size }
          },
          error
        );
      }
    }
    finally { writing = false; }
  }
  const maxConnections = positiveIntegerEnv("MAX_REALTIME_CONNECTIONS", 200);
  const maxRooms = positiveIntegerEnv("MAX_REALTIME_ROOMS", 100);
  const realtime = createRealtimeServer({
    secret,
    maxConnections,
    maxRooms,
    dependencyHealth: () => ({ persistence, pendingResults: pending.size }),
    onResult: (result) => {
      if (!results) return;
      pending.set(result.roundId, result);
      void flush();
    }
  });
  const retry = setInterval(() => void flush(), 5000);
  const port = Number(process.env.PORT ?? 3001);
  realtime.http.listen(port, "0.0.0.0", () => console.info(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "realtime",
    event: "server.listening",
    port,
    maxConnections,
    maxRooms
  })));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(retry);
    await realtime.close({ graceMs: 5000 });
    await flush();
    await mongo?.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
void main().catch((error) => {
  reportOperationalError(
    {
      service: "realtime",
      event: "server.startup.failed",
      summary: "Multiplayer server startup failed; check configuration and database connectivity"
    },
    error
  );
  process.exit(1);
});
