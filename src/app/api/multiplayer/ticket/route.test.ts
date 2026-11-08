import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/activity-session", () => ({ findActivitySession: vi.fn() }));
vi.mock("@/lib/discord-activity-instance", () => ({ verifyDiscordActivityInstance: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { findActivitySession } from "@/lib/activity-session";
import { verifyDiscordActivityInstance } from "@/lib/discord-activity-instance";
import { verifyJoinTicket } from "@/lib/multiplayer-ticket";
import { enforceRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";

const secret = "ticket-route-secret-with-at-least-32-chars";

function requestTicket(body?: string) {
  return POST(new Request("http://localhost/api/multiplayer/ticket", {
    method: "POST",
    headers: { authorization: "Bearer session-token", ...(body ? { "content-type": "application/json" } : {}) },
    body
  }));
}

async function ticketFrom(response: Response) {
  const payload = await response.json() as { ticket: string };
  return verifyJoinTicket(payload.ticket, secret, Date.now());
}

describe("POST /api/multiplayer/ticket", () => {
  beforeEach(() => {
    vi.stubEnv("MULTIPLAYER_SECRET", secret);
    vi.mocked(enforceRateLimit).mockResolvedValue(null);
    vi.mocked(findActivitySession).mockResolvedValue({
      playerId: "player-1", displayName: "Alice", instanceId: "instance-1"
    } as Awaited<ReturnType<typeof findActivitySession>>);
    vi.mocked(verifyDiscordActivityInstance).mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof verifyDiscordActivityInstance>>);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it("issues a duel ticket when the body is empty, as older clients send", async () => {
    const response = await requestTicket();
    expect(response.status).toBe(200);
    const ticket = await ticketFrom(response);
    expect(ticket).toMatchObject({ playerId: "player-1", roomId: "instance-1" });
    expect(ticket).not.toHaveProperty("mode");
  });

  it("signs the party lobby into the ticket", async () => {
    const ticket = await ticketFrom(await requestTicket(JSON.stringify({ mode: "party" })));
    expect(ticket?.mode).toBe("party");
  });

  it("rejects an invalid body before touching the session", async () => {
    for (const body of ["{", JSON.stringify({ mode: "ranked" }), JSON.stringify({ mode: "party", roomId: "other" })]) {
      const response = await requestTicket(body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false });
    }
    expect(findActivitySession).not.toHaveBeenCalled();
  });
});
