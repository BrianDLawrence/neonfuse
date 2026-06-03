import { Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {
  serverSelectionTimeoutMS: 5000
};

let client: MongoClient | undefined;
let clientPromise: Promise<MongoClient> | undefined;

const globalWithMongo = globalThis as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

function createClientPromise() {
  if (!uri) {
    return undefined;
  }

  client = new MongoClient(uri, options);
  const nextClientPromise = client.connect().catch((error) => {
    if (clientPromise === nextClientPromise) {
      clientPromise = undefined;
    }

    if (globalWithMongo._mongoClientPromise === nextClientPromise) {
      globalWithMongo._mongoClientPromise = undefined;
    }

    throw error;
  });

  return nextClientPromise;
}

if (!uri) {
  clientPromise = undefined;
} else {
  if (process.env.NODE_ENV === "development") {
    if (!globalWithMongo._mongoClientPromise) {
      globalWithMongo._mongoClientPromise = createClientPromise();
    }

    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    clientPromise = createClientPromise();
  }
}

export async function getMongoDb() {
  if (!clientPromise) {
    throw new Error("MONGODB_URI is not configured.");
  }

  const mongoClient = await clientPromise;
  return mongoClient.db(process.env.MONGODB_DB ?? "neon-fuse");
}

function getMongoErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "MongoDB is unavailable.";
}

export async function tryGetMongoDb(): Promise<{
  db: Db | null;
  mongo: "connected" | "not-configured" | "unavailable";
  error?: string;
}> {
  if (!uri) {
    return { db: null, mongo: "not-configured" };
  }

  try {
    return { db: await getMongoDb(), mongo: "connected" };
  } catch (error) {
    return {
      db: null,
      mongo: "unavailable",
      error: getMongoErrorMessage(error)
    };
  }
}
