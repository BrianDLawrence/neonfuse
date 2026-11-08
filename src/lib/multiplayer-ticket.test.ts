import { describe, expect, it } from "vitest";
import { signJoinTicket, verifyJoinTicket } from "./multiplayer-ticket";
const secret = "test-secret-with-at-least-32-characters";
describe("multiplayer tickets", () => {
  it("binds identity to a room and rejects tampering, expiry, wrong keys, and malformed tokens", () => {
    const identity = { playerId: "a", name: "Alice", roomId: "party" };
    const token = signJoinTicket(identity, secret, 0);
    expect(verifyJoinTicket(token, secret, 1)).toMatchObject(identity);
    expect(verifyJoinTicket(token, secret, 30000)).toBeNull();
    expect(verifyJoinTicket(token, secret + "other", 1)).toBeNull();
    expect(verifyJoinTicket("changed" + token, secret, 1)).toBeNull();
    expect(verifyJoinTicket("invalid", secret, 1)).toBeNull();
  });
  it("signs the party mode into the ticket and leaves duel tickets without one", () => {
    const duel = verifyJoinTicket(signJoinTicket({ playerId: "a", name: "Alice", roomId: "party" }, secret, 0), secret, 1);
    expect(duel).not.toHaveProperty("mode");
    const party = verifyJoinTicket(signJoinTicket({ playerId: "a", name: "Alice", roomId: "party", mode: "party" }, secret, 0), secret, 1);
    expect(party?.mode).toBe("party");
  });
});
