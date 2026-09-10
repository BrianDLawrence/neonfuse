import { toNextJsHandler } from "better-auth/next-js";
import { auth, isAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

function configurationError() {
  return Response.json(
    { error: "Authentication is not configured for this deployment." },
    { status: 503 }
  );
}

export function GET(request: Request) {
  return isAuthConfigured() ? handlers.GET(request) : configurationError();
}

export function POST(request: Request) {
  return isAuthConfigured() ? handlers.POST(request) : configurationError();
}
