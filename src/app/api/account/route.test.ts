import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongodb", () => ({ tryGetMongoDb: vi.fn() }));
vi.mock("@/lib/player-data-deletion", () => ({ deletePlayerData: vi.fn() }));
vi.mock("@/lib/player-identity", () => ({ getAuthenticatedPlayer: vi.fn() }));

import { tryGetMongoDb } from "@/lib/mongodb";
import { deletePlayerData } from "@/lib/player-data-deletion";
import { getAuthenticatedPlayer } from "@/lib/player-identity";
import { DELETE } from "./route";

const player = {
  id: "discord-player",
  authUserId: "auth-user",
  discordUserId: "discord-user",
  displayName: "Fuse Pilot",
  source: "web" as const
};
const db = { collection: vi.fn() };

function deletionRequest(body: unknown) {
  return new Request("http://localhost/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAuthenticatedPlayer).mockResolvedValue(player);
  vi.mocked(tryGetMongoDb).mockResolvedValue({ db: db as never, mongo: "connected" });
  vi.mocked(deletePlayerData).mockResolvedValue({ deletedDocuments: 8 });
});

describe("account deletion route", () => {
  it("rejects unauthenticated deletion before touching storage", async () => {
    vi.mocked(getAuthenticatedPlayer).mockResolvedValue(null);

    const response = await DELETE(deletionRequest({ confirmation: "DELETE MY DATA" }));

    expect(response.status).toBe(401);
    expect(tryGetMongoDb).not.toHaveBeenCalled();
    expect(deletePlayerData).not.toHaveBeenCalled();
  });

  it("requires the exact server-validated confirmation phrase", async () => {
    const response = await DELETE(deletionRequest({ confirmation: "delete" }));

    expect(response.status).toBe(400);
    expect(deletePlayerData).not.toHaveBeenCalled();
  });

  it("returns a retryable error when account storage is unavailable", async () => {
    vi.mocked(tryGetMongoDb).mockResolvedValue({ db: null, mongo: "unavailable" });

    const response = await DELETE(deletionRequest({ confirmation: "DELETE MY DATA" }));

    expect(response.status).toBe(503);
    expect(deletePlayerData).not.toHaveBeenCalled();
  });

  it("deletes all data for the authenticated player and expires auth cookies", async () => {
    const response = await DELETE(deletionRequest({ confirmation: "DELETE MY DATA" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, deleted: true });
    expect(deletePlayerData).toHaveBeenCalledWith(db, player);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
