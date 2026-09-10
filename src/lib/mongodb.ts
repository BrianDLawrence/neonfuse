import { Db, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {
  serverSelectionTimeoutMS: 5000
};

let client: MongoClient | undefined;
let clientPromise: Promise<MongoClient> | undefined;

const globalWithMongo = globalThis as typeof globalThis & {
  _mongoClient?: MongoClient;
  _mongoClientPromise?: Promise<MongoClient>;
};

export function getMongoClient() {
  if (process.env.NODE_ENV === "development" && globalWithMongo._mongoClient) {
    return globalWithMongo._mongoClient;
  }

  if (!client) {
    // Better Auth needs a synchronous Db handle while its configuration is
    // created. The fallback is never contacted because unconfigured auth
    // routes return a 503 before invoking Better Auth.
    client = new MongoClient(uri ?? "mongodb://127.0.0.1:27017", options);
  }

  if (process.env.NODE_ENV === "development") {
    globalWithMongo._mongoClient = client;
  }

  return client;
}

function createClientPromise() {
  if (!uri) {
    return undefined;
  }

  const mongoClient = getMongoClient();
  const nextClientPromise = mongoClient.connect().catch((error) => {
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
