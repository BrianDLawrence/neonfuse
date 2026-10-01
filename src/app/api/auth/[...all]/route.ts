import { toNextJsHandler } from "better-auth/next-js";
import { auth, isAuthConfigured } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

function configurationError() {
  return Response.json(
    { error: "Authentication is not configured for this deployment." },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, "authRead");
  return limited ?? (isAuthConfigured() ? handlers.GET(request) : configurationError());
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "authWrite");
  return limited ?? (isAuthConfigured() ? handlers.POST(request) : configurationError());
}
