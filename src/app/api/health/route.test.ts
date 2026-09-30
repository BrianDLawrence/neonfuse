import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/auth", () => ({ isAuthConfigured: vi.fn() }));

import { isAuthConfigured } from "@/lib/auth";
import { tryGetMongoDb } from "@/lib/mongodb";
import { GET } from "./route";

const rawMongoError =
  "connect ECONNREFUSED cluster0-shard-00.internal.example:27017 via mongodb+srv://neon:hunter2@cluster0.internal.example";

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isAuthConfigured).mockReturnValue(true);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("health route", () => {
  it("reports ok when MongoDB is not configured", async () => {
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: null, mongo: "not-configured" });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, mongo: "not-configured", authentication: "configured" });
  });

  it("does not expose the raw connection error to callers", async () => {
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: null, mongo: "unavailable", error: rawMongoError });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      mongo: "unavailable",
      authentication: "configured",
      discordActivity: expect.any(String)
    });
    expect(JSON.stringify(payload)).not.toContain("internal.example");
  });

  it("logs connection failures server-side without credentials", async () => {
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: null, mongo: "unavailable", error: rawMongoError });

    await GET();

    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = String(consoleError.mock.calls[0]?.[0]);
    expect(logged).toContain("connect failed");
    expect(logged).not.toContain("hunter2");
    expect(logged).toContain("//<redacted>@");
  });

  it("returns 503 instead of throwing when the ping fails", async () => {
    const command = vi.fn().mockRejectedValue(new Error(rawMongoError));
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: { command } as never, mongo: "connected" });

    const response = await GET();
    const payload = await response.json();

    expect(command).toHaveBeenCalledWith({ ping: 1 });
    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ ok: false, mongo: "unavailable" });
    expect(payload).not.toHaveProperty("error");
    expect(String(consoleError.mock.calls[0]?.[0])).not.toContain("hunter2");
  });

  it("reports connected when the ping succeeds", async () => {
    const command = vi.fn().mockResolvedValue({ ok: 1 });
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: { command } as never, mongo: "connected" });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, mongo: "connected" });
    expect(consoleError).not.toHaveBeenCalled();
  });
});
