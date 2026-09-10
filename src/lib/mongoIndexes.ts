import type { Db } from "mongodb";

let indexPromise: Promise<void> | undefined;

export function ensureGameIndexes(db: Db) {
  if (!indexPromise) {
    indexPromise = Promise.all([
      db.collection("visitors").createIndex({ visitorId: 1 }, { unique: true }),
      db.collection("visitors").createIndex({ accountId: 1 }),
      db.collection("matches").createIndex({ visitorId: 1 }),
      db.collection("matches").createIndex({ accountId: 1 }),
      db.collection("matches").createIndex({ score: -1 }),
      db.collection("matches").createIndex({ mode: 1, score: -1 }),
      db.collection("high-scores").createIndex({ visitorId: 1 }),
      db.collection("high-scores").createIndex({ accountId: 1 }),
      db.collection("high-scores").createIndex({ matchId: 1 }, { unique: true }),
      db.collection("high-scores").createIndex({ score: -1 }),
      db.collection("high-scores").createIndex({ mode: 1, score: -1 })
    ]).then(() => undefined);
  }

  return indexPromise;
}
