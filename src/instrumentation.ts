import type { Instrumentation } from "next";
import { reportOperationalError } from "@/lib/server-observability";

function errorDigest(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
  ) {
    return error.digest;
  }
  return undefined;
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context
) => {
  reportOperationalError(
    {
      service: "web",
      event: "request.unhandled-error",
      summary: "Next.js captured an unhandled server request error",
      fields: {
        method: request.method,
        route: context.routePath,
        routeType: context.routeType,
        digest: errorDigest(error)
      }
    },
    error
  );
};
