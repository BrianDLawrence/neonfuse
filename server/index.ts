import { MongoClient } from "mongodb";
import { createRealtimeServer } from "./realtime";
import type { DuelResult } from "./rooms";

async function main() {
  const secret = process.env.MULTIPLAYER_SECRET ?? "";
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required for multiplayer results");
  const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await mongo.connect();
  const results = mongo.db(process.env.MONGODB_DB ?? "neon-fuse").collection("duel_results");
  await results.createIndex({ roundId: 1 }, { unique: true });
  const pending = new Map<string, DuelResult>();
  let writing = false;
  async function flush() {
    if (writing) return;
    writing = true;
    try {
      for (const result of pending.values()) {
        await results.updateOne({ roundId: result.roundId }, { $setOnInsert: { ...result, createdAt: new Date() } }, { upsert: true });
        pending.delete(result.roundId);
      }
    } catch { console.error("Multiplayer result storage unavailable; retrying."); }
    finally { writing = false; }
  }
  const realtime = createRealtimeServer({ secret, onResult: (result) => { pending.set(result.roundId, result); void flush(); } });
  const retry = setInterval(() => void flush(), 5000);
  const port = Number(process.env.PORT ?? 3001);
  realtime.http.listen(port, "0.0.0.0", () => console.info(`Neon Fuse multiplayer listening on port ${port}`));
  const stop = async () => {
    clearInterval(retry);
    await realtime.close();
    await flush();
    await mongo.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
void main().catch(() => { console.error("Multiplayer server startup failed. Check server configuration and database connectivity."); process.exit(1); });
