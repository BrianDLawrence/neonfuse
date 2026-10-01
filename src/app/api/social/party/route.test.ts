import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/activity-session", () => ({ findActivitySession: vi.fn() }));
vi.mock("@/lib/discord-activity-instance", () => ({ verifyDiscordActivityInstance: vi.fn() }));
vi.mock("@/lib/discord-party", () => ({ loadDiscordPartyRoster: vi.fn() }));
vi.mock("@/lib/mongoIndexes", () => ({ ensureGameIndexes: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { findActivitySession } from "@/lib/activity-session";
import { verifyDiscordActivityInstance } from "@/lib/discord-activity-instance";
import { loadDiscordPartyRoster } from "@/lib/discord-party";
import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { enforceRateLimit } from "@/lib/rate-limit";
import { GET } from "./route";

const identity = {
  playerId: "player-a",
  discordUserId: "discord-a",
  displayName: "Alice",
  instanceId: "party"
};
const db = { collection: vi.fn() };
const request = (token = "activity-session-token-that-is-long-enough") =>
  new Request("http://localhost/api/social/party", {
    headers: { authorization: `Bearer ${token}` }
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(findActivitySession).mockResolvedValue(identity);
  vi.mocked(verifyDiscordActivityInstance).mockResolvedValue({
    ok: true,
    discordUserIds: ["discord-a", "discord-b"]
  });
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(ensureGameIndexes).mockResolvedValue();
  vi.mocked(loadDiscordPartyRoster).mockResolvedValue({
    connectedCount: 2,
    members: []
  });
});

describe("Discord party social route", () => {
  it("requires a valid Activity bearer session", async () => {
    expect((await GET(new Request("http://localhost/api/social/party"))).status).toBe(401);
    vi.mocked(findActivitySession).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(verifyDiscordActivityInstance).not.toHaveBeenCalled();
  });

  it("rejects callers outside the verified Discord Activity instance", async () => {
    vi.mocked(verifyDiscordActivityInstance).mockResolvedValue({
      ok: false,
      status: 403,
      error: "Join the party first."
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(tryGetMongoDb).not.toHaveBeenCalled();
    expect(loadDiscordPartyRoster).not.toHaveBeenCalled();
  });

  it("returns only the verified instance roster with no-store caching", async () => {
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(ensureGameIndexes).toHaveBeenCalledWith(db);
    expect(loadDiscordPartyRoster).toHaveBeenCalledWith(
      db,
      "party",
      ["discord-a", "discord-b"],
      "discord-a"
    );
    expect(payload.roster.connectedCount).toBe(2);
  });
});
