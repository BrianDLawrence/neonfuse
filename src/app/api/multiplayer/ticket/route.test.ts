import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/activity-session", () => ({ findActivitySession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
import { findActivitySession } from "@/lib/activity-session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { POST } from "./route";
import { verifyJoinTicket } from "@/lib/multiplayer-ticket";

const secret = "test-secret-with-at-least-32-characters";
const request = () => new Request("http://localhost/api/multiplayer/ticket", { method: "POST", headers: { authorization: "Bearer session" } });
beforeEach(() => {
  vi.stubEnv("MULTIPLAYER_SECRET", secret); vi.stubEnv("DISCORD_BOT_TOKEN", "test-bot-token"); vi.stubEnv("DISCORD_CLIENT_ID", "app");
  vi.mocked(enforceRateLimit).mockResolvedValue(null);
  vi.mocked(findActivitySession).mockResolvedValue({ playerId: "a", discordUserId: "discord-a", displayName: "Alice", instanceId: "party" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe("Discord party admission", () => {
  it("issues room-bound tickets only after verifying Discord membership", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ application_id: "app", instance_id: "party", users: ["discord-a"] }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(200);
    const { ticket } = await response.json();
    expect(verifyJoinTicket(ticket, secret, Date.now())).toMatchObject({ playerId: "a", roomId: "party" });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/app/activity-instances/party"), expect.anything());
  });
  it("rejects a forged instance claim even with a valid user session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ application_id: "app", instance_id: "party", users: ["someone-else"] })));
    expect((await POST(request())).status).toBe(403);
  });
  it("rejects missing and expired sessions without querying Discord", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(new Request("http://localhost", { method: "POST" }))).status).toBe(401);
    vi.mocked(findActivitySession).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
