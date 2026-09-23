import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportOperationalError,
  reportOperationalWarning
} from "./server-observability";

afterEach(() => vi.restoreAllMocks());

describe("server observability", () => {
  it("emits structured events without error details or sensitive fields", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportOperationalError(
      {
        service: "realtime",
        event: "result.write.failed",
        summary: "Result persistence is unavailable",
        fields: {
          pendingResults: 2,
          roomId: "private-room",
          databaseUrl: "mongodb://user:secret@example.test"
        }
      },
      new Error("mongodb://user:secret@example.test leaked from driver")
    );

    const event = String(output.mock.calls[0][0]);
    expect(event).toContain('"event":"result.write.failed"');
    expect(event).toContain('"pendingResults":2');
    expect(event).toContain('"roomId":"[redacted]"');
    expect(event).not.toContain("private-room");
    expect(event).not.toContain("mongodb://");
    expect(event).not.toContain("leaked from driver");
  });

  it("normalizes warning text into a single JSON log line", () => {
    const output = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportOperationalWarning({
      service: "realtime",
      event: "persistence.disabled",
      summary: "Results\nwill not be persisted"
    });

    expect(String(output.mock.calls[0][0])).toContain(
      '"summary":"Results will not be persisted"'
    );
  });

  it("does not trust a custom error name", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("safe");
    error.name = "private-secret-name";

    reportOperationalError(
      { service: "web", event: "request.failed", summary: "Request failed" },
      error
    );

    const event = String(output.mock.calls[0][0]);
    expect(event).toContain('"errorKind":"Error"');
    expect(event).not.toContain("private-secret-name");
  });
});
