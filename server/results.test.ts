import { describe, expect, it } from "vitest";
import { partyRoundDocument, partySeriesDocument } from "./results";
import type { PartyRoundResult, PartySeriesResult, RoundSeat } from "./rooms";

const seats: RoundSeat[] = [
  { kind: "human", playerId: "a", name: "Alice" },
  { kind: "human", playerId: "b", name: "Bob" },
  { kind: "bot", profileId: "volt-warden" },
  { kind: "bot", profileId: "glitch-bloom" }
];
const round: PartyRoundResult = {
  kind: "round", roundId: "round-1", roomId: "instance#party", seriesId: "series-1", seriesRound: 1,
  seats, winnerSeat: 1, reason: "blast", durationMs: 42_000
};
const series: PartySeriesResult = {
  kind: "series", seriesId: "series-1", roomId: "instance#party", seats, wins: [0, 2, 1, 0], rounds: 3, winnerSeat: 1, reason: "won"
};

describe("party result documents", () => {
  it("stores only people as players and never their display names", () => {
    const document = partyRoundDocument(round);
    expect(document).toEqual({
      mode: "party", roundId: "round-1", roomId: "instance#party", seriesId: "series-1", seriesRound: 1,
      players: ["a", "b"],
      seats: [{ kind: "human", playerId: "a" }, { kind: "human", playerId: "b" }, { kind: "bot", profileId: "volt-warden" }, { kind: "bot", profileId: "glitch-bloom" }],
      outcome: "human", winnerId: "b", winnerSeat: 1, reason: "blast", durationMs: 42_000
    });
    expect(JSON.stringify(document)).not.toContain("Alice");
  });

  it("records a bot win as a bot outcome with no winning player, not as a draw", () => {
    expect(partyRoundDocument({ ...round, winnerSeat: 2 })).toMatchObject({ outcome: "bot", winnerId: null, winnerSeat: 2 });
    expect(partyRoundDocument({ ...round, winnerSeat: null, reason: "timeout" })).toMatchObject({ outcome: "draw", winnerId: null });
  });

  it("refuses rounds that break the guards", () => {
    const solo = [seats[0], { kind: "bot", profileId: "fuse-rush" }, seats[2], seats[3]] as RoundSeat[];
    expect(partyRoundDocument({ ...round, seats: solo, winnerSeat: 0 })).toBeNull();
    expect(partyRoundDocument({ ...round, seats: [seats[0], seats[0], seats[2], seats[3]] })).toBeNull();
    expect(partyRoundDocument({ ...round, reason: "abandoned" })).toBeNull();
    expect(partyRoundDocument({ ...round, durationMs: -1 })).toBeNull();
    expect(partyRoundDocument({ ...round, seats: seats.slice(0, 3) })).toBeNull();
  });

  it("stores a finished series with its winner seat", () => {
    expect(partySeriesDocument(series)).toEqual({
      seriesId: "series-1", roomId: "instance#party", players: ["a", "b"],
      seats: [{ kind: "human", playerId: "a" }, { kind: "human", playerId: "b" }, { kind: "bot", profileId: "volt-warden" }, { kind: "bot", profileId: "glitch-bloom" }],
      wins: [0, 2, 1, 0], rounds: 3, winner: { kind: "human", playerId: "b" }, reason: "won"
    });
    expect(partySeriesDocument({ ...series, winnerSeat: 2 })?.winner).toEqual({ kind: "bot", profileId: "volt-warden" });
    expect(partySeriesDocument({ ...series, wins: [2, 2, 2, 0] })).toBeNull();
  });
});
