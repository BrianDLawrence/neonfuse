import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));

import { tryGetMongoDb } from "@/lib/mongodb";
import { checkRateLimit, enforceRateLimit } from "@/lib/rate-limit";

function request(ip: string, sessionToken?: string) {
  return new Request("http://localhost/api/test", {
    headers: {
      "x-real-ip": ip,
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {})
    }
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: null, mongo: "not-configured" });
});

describe("rate limiting", () => {
  it("blocks a client after the configured fixed-window limit", async () => {
    const client = request("198.51.100.10");
    const now = 1_800_000_000_000;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await checkRateLimit(client, "matchWrite", now)).allowed).toBe(true);
    }

    const blocked = await checkRateLimit(client, "matchWrite", now);
    expect(blocked).toMatchObject({ allowed: false, limit: 30, remaining: 0 });
  });

  it("keeps separate buckets for separate clients", async () => {
    const now = 1_800_000_060_000;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await checkRateLimit(request("198.51.100.11"), "matchWrite", now);
    }

    expect(
      (await checkRateLimit(request("198.51.100.12"), "matchWrite", now)).allowed
    ).toBe(true);
  });

  it("limits Activity players per session even when they share a Discord proxy address", async () => {
    const now = 1_800_000_180_000;
    const proxyAddress = "192.0.2.50";
    const firstPlayer = request(proxyAddress, "first-player-session-token-000000000000");

    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await checkRateLimit(firstPlayer, "matchWrite", now)).allowed).toBe(true);
    }

    expect((await checkRateLimit(firstPlayer, "matchWrite", now)).allowed).toBe(false);
    expect(
      (
        await checkRateLimit(
          request(proxyAddress, "second-player-session-token-00000000000"),
          "matchWrite",
          now
        )
      ).allowed
    ).toBe(true);
  });

  it("caps forged bearer tokens with a looser per-address ceiling", async () => {
    const now = 1_800_000_240_000;
    const results = [];

    for (let attempt = 0; attempt < 30 * 25 + 1; attempt += 1) {
      results.push(
        await checkRateLimit(request("192.0.2.51", `forged-token-${attempt}`), "matchWrite", now)
      );
    }

    expect(results.slice(0, -1).every((result) => result.allowed)).toBe(true);
    expect(results.at(-1)).toMatchObject({ allowed: false, limit: 750 });
  });

  it("stores only a keyed digest in the shared MongoDB bucket", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const createIndex = vi.fn().mockResolvedValue("expiresAt_1");
    const db = {
      collection: vi.fn(() => ({ createIndex, findOneAndUpdate }))
    };
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });

    await checkRateLimit(request("203.0.113.24"), "matchWrite", 1_800_000_120_000);

    expect(findOneAndUpdate).toHaveBeenCalledOnce();
    const filter = findOneAndUpdate.mock.calls[0]?.[0] as { _id: string };
    expect(filter._id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(findOneAndUpdate.mock.calls[0])).not.toContain("203.0.113.24");
  });

  it("never stores a raw Activity session token in the shared bucket", async () => {
    const findOneAndUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const createIndex = vi.fn().mockResolvedValue("expiresAt_1");
    const db = {
      collection: vi.fn(() => ({ createIndex, findOneAndUpdate }))
    };
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });

    await checkRateLimit(
      request("203.0.113.25", "secret-session-token-value-0000000000000"),
      "matchWrite",
      1_800_000_300_000
    );

    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(findOneAndUpdate.mock.calls)).not.toContain("secret-session-token");
  });

  it("returns a standards-friendly 429 response", async () => {
    const client = request("198.51.100.13");

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await enforceRateLimit(client, "matchWrite");
    }

    const response = await enforceRateLimit(client, "matchWrite");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(response?.headers.get("x-ratelimit-limit")).toBe("30");
    await expect(response?.json()).resolves.toMatchObject({ ok: false });
  });
});
