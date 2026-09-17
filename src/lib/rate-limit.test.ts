import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));

import { tryGetMongoDb } from "@/lib/mongodb";
import { checkRateLimit, enforceRateLimit } from "@/lib/rate-limit";

function request(ip: string) {
  return new Request("http://localhost/api/test", {
    headers: { "x-real-ip": ip }
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

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await checkRateLimit(client, "activitySession", now)).allowed).toBe(true);
    }

    const blocked = await checkRateLimit(client, "activitySession", now);
    expect(blocked).toMatchObject({ allowed: false, limit: 10, remaining: 0 });
  });

  it("keeps separate buckets for separate clients", async () => {
    const now = 1_800_000_060_000;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await checkRateLimit(request("198.51.100.11"), "activitySession", now);
    }

    expect(
      (await checkRateLimit(request("198.51.100.12"), "activitySession", now)).allowed
    ).toBe(true);
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

  it("returns a standards-friendly 429 response", async () => {
    const client = request("198.51.100.13");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await enforceRateLimit(client, "activitySession");
    }

    const response = await enforceRateLimit(client, "activitySession");

    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(response?.headers.get("x-ratelimit-limit")).toBe("10");
    await expect(response?.json()).resolves.toMatchObject({ ok: false });
  });
});
