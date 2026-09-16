import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongoIndexes", () => ({ ensureGameIndexes: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));
vi.mock("@/lib/player-profiles", () => ({
  getOrCreatePlayerProfile: vi.fn(),
  updatePlayerProfile: vi.fn()
}));

import { ensureGameIndexes } from "@/lib/mongoIndexes";
import { tryGetMongoDb } from "@/lib/mongodb";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { getOrCreatePlayerProfile, updatePlayerProfile } from "@/lib/player-profiles";
import { GET, PATCH } from "./route";

const player = {
  id: "discord-player",
  displayName: "Fuse Pilot",
  source: "web" as const
};
const db = { collection: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(ensureGameIndexes).mockResolvedValue();
});

describe("profile route", () => {
  it("rejects unauthenticated profile reads before touching MongoDB", async () => {
    vi.mocked(getAuthenticatedPlayer).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/profile"));

    expect(response.status).toBe(401);
    expect(tryGetMongoDb).not.toHaveBeenCalled();
    expect(getOrCreatePlayerProfile).not.toHaveBeenCalled();
  });

  it("rejects attempts to write server-owned progression", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: { musicEnabled: true }, progression: { xp: 50 } })
      })
    );

    expect(response.status).toBe(400);
    expect(updatePlayerProfile).not.toHaveBeenCalled();
  });

  it("applies a valid preference patch to the authenticated player only", async () => {
    vi.mocked(updatePlayerProfile).mockResolvedValue({ playerId: player.id } as never);

    const response = await PATCH(
      new Request("http://localhost/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences: { musicVolume: 6 } })
      })
    );

    expect(response.status).toBe(200);
    expect(updatePlayerProfile).toHaveBeenCalledWith(db, player, {
      preferences: { musicVolume: 6 }
    });
  });
});
