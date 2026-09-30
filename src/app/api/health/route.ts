import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth";
import { tryGetMongoDb } from "@/lib/mongodb";

// Driver errors can embed the connection string, so strip any userinfo
// (`//user:pass@`) before the message reaches server logs.
function redactCredentials(message: string) {
  return message.replace(/\/\/[^/\s@]+@/g, "//<redacted>@");
}

function logMongoFailure(stage: "connect" | "ping", error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
  console.error(`Health check MongoDB ${stage} failed: ${redactCredentials(message)}`);
}

export async function GET() {
  const { db, error, mongo } = await tryGetMongoDb();
  const authentication = isAuthConfigured() ? "configured" : "not-configured";
  const discordActivity = [
    process.env.MONGODB_URI,
    process.env.DISCORD_CLIENT_ID,
    process.env.DISCORD_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  ].every(Boolean)
    ? "configured"
    : "not-configured";

  if (!db) {
    if (mongo === "unavailable") {
      logMongoFailure("connect", error);
    }

    return NextResponse.json(
      {
        ok: mongo === "not-configured",
        mongo,
        authentication,
        discordActivity
      },
      { status: mongo === "not-configured" ? 200 : 503 }
    );
  }

  try {
    await db.command({ ping: 1 });
  } catch (pingError) {
    logMongoFailure("ping", pingError);

    return NextResponse.json(
      {
        ok: false,
        mongo: "unavailable",
        authentication,
        discordActivity
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    mongo,
    authentication,
    discordActivity
  });
}
