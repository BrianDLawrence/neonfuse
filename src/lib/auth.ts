import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { betterAuth } from "better-auth";
import { getMongoClient } from "@/lib/mongodb";

const developmentFallbackSecret =
  "neon-fuse-auth-is-not-configured-do-not-use-this-secret";

export function isAuthConfigured(): boolean {
  return [
    process.env.MONGODB_URI,
    process.env.BETTER_AUTH_SECRET,
    process.env.BETTER_AUTH_URL,
    process.env.DISCORD_CLIENT_ID,
    process.env.DISCORD_CLIENT_SECRET
  ].every(Boolean);
}

const mongoClient = getMongoClient();
const authDatabase = isAuthConfigured()
  ? mongodbAdapter(mongoClient.db(process.env.MONGODB_DB ?? "neon-fuse"), {
      client: mongoClient
    })
  : undefined;

export const auth = betterAuth({
  appName: "Neon Fuse",
  database: authDatabase,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? developmentFallbackSecret,
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "not-configured",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "not-configured"
    }
  },
  advanced: {
    database: {
      joins: true
    }
  }
});

export async function getAuthSession(request: Request) {
  if (!isAuthConfigured()) {
    return null;
  }

  return auth.api.getSession({ headers: request.headers });
}

export type AuthSession = typeof auth.$Infer.Session;
