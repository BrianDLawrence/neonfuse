import { MongoClient, type Collection, type Document } from "mongodb";
import { createRealtimeServer } from "./realtime";
import type { PartyResult } from "./rooms";
import { partyRoundDocument, partySeriesDocument } from "./results";
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
  let partySeries: Collection<Document> | undefined;
  let persistence: "connected" | "not-configured" | "unavailable" = mongoUri
    ? "unavailable"
    : "not-configured";
  if (mongoUri) {
    mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await mongo.connect();
    results = mongo.db(process.env.MONGODB_DB ?? "neon-fuse").collection("duel_results");
    await results.createIndex({ roundId: 1 }, { unique: true });
    partySeries = mongo.db(process.env.MONGODB_DB ?? "neon-fuse").collection("party_series");
    await partySeries.createIndex({ seriesId: 1 }, { unique: true });
    persistence = "connected";
  } else {
    reportOperationalWarning({
      service: "realtime",
      event: "persistence.disabled",
      summary: "MONGODB_URI is not set; multiplayer results will not be persisted"
    });
  }
  // Every write is an idempotent insert keyed by a unique ID, so retries never duplicate a result.
  type PendingWrite = { collection: "duel_results" | "party_series"; filter: Document; document: Document };
  const pending = new Map<string, PendingWrite>();
  let writing = false;
  let lastPersistenceAlert = 0;
  async function flush() {
    if (writing || !results || !partySeries) return;
    writing = true;
    try {
      for (const [key, write] of pending) {
        const collection = write.collection === "party_series" ? partySeries : results;
        await collection.updateOne(write.filter, { $setOnInsert: { ...write.document, createdAt: new Date() } }, { upsert: true });
        pending.delete(key);
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
      pending.set(result.roundId, { collection: "duel_results", filter: { roundId: result.roundId }, document: result });
      void flush();
    },
    onPartyResult: (result: PartyResult) => {
      if (!results) return;
      const document = result.kind === "round" ? partyRoundDocument(result) : partySeriesDocument(result);
      if (!document) {
        reportOperationalWarning({
          service: "realtime",
          event: "result.party.rejected",
          summary: "A Party Brawl result failed validation and was not stored",
          fields: { kind: result.kind }
        });
        return;
      }
      if (result.kind === "round") {
        pending.set(result.roundId, { collection: "duel_results", filter: { roundId: result.roundId }, document });
      } else {
        pending.set(`series:${result.seriesId}`, { collection: "party_series", filter: { seriesId: result.seriesId }, document });
      }
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
