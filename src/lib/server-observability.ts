type SafeField = string | number | boolean | null | undefined;

type OperationalEvent = {
  service: "web" | "realtime";
  event: string;
  summary: string;
  fields?: Record<string, SafeField>;
};

const SENSITIVE_FIELD =
  /authorization|cookie|credential|email|instance|password|player|room|secret|session|token|uri|url|user/i;
const SAFE_ERROR_KINDS = new Set([
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError"
]);
const MAX_FIELD_LENGTH = 160;

function cleanText(value: string): string {
  return value.replace(/[\r\n\t]/g, " ").slice(0, MAX_FIELD_LENGTH);
}

function safeFields(fields: Record<string, SafeField> | undefined) {
  if (!fields) return undefined;

  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (SENSITIVE_FIELD.test(key)) return [key, "[redacted]"];
      return [key, typeof value === "string" ? cleanText(value) : value];
    })
  );
}

function errorKind(error: unknown): string {
  if (error instanceof Error) {
    return SAFE_ERROR_KINDS.has(error.name) ? error.name : "Error";
  }
  return typeof error === "string" ? "StringError" : "UnknownError";
}

/**
 * Emit a provider-neutral JSON event for Vercel/Render log drains. Error messages,
 * stacks, request headers, and arbitrary objects are deliberately excluded.
 */
export function reportOperationalError(
  details: OperationalEvent,
  error: unknown
): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: details.service,
      event: cleanText(details.event),
      summary: cleanText(details.summary),
      errorKind: errorKind(error),
      fields: safeFields(details.fields)
    })
  );
}

export function reportOperationalWarning(details: OperationalEvent): void {
  console.warn(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      service: details.service,
      event: cleanText(details.event),
      summary: cleanText(details.summary),
      fields: safeFields(details.fields)
    })
  );
}
