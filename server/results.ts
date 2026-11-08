import {
  partyRoundDocumentSchema,
  partySeriesDocumentSchema,
  type PartyRoundDocument,
  type PartySeriesDocument
} from "../src/lib/schemas/party-result";
import type { PartyRoundResult, PartySeriesResult, RoundSeat } from "./rooms";

/** Stored seats keep account IDs and bot profiles, never display names. */
function storedSeats(seats: RoundSeat[]) {
  return seats.map((seat) => (seat.kind === "human" ? { kind: "human" as const, playerId: seat.playerId } : seat));
}

function humans(seats: RoundSeat[]) {
  return seats.flatMap((seat) => (seat.kind === "human" ? [seat.playerId] : []));
}

/** A party round as stored in `duel_results`; `null` when it fails validation and must not be written. */
export function partyRoundDocument(result: PartyRoundResult): PartyRoundDocument | null {
  const winner = result.winnerSeat === null ? null : result.seats[result.winnerSeat];
  const parsed = partyRoundDocumentSchema.safeParse({
    mode: "party",
    roundId: result.roundId,
    roomId: result.roomId,
    seriesId: result.seriesId,
    seriesRound: result.seriesRound,
    players: humans(result.seats),
    seats: storedSeats(result.seats),
    outcome: winner ? winner.kind : "draw",
    winnerId: winner?.kind === "human" ? winner.playerId : null,
    winnerSeat: result.winnerSeat,
    reason: result.reason,
    durationMs: result.durationMs
  });
  return parsed.success ? parsed.data : null;
}

/** A finished series as stored in `party_series`; `null` when it fails validation. */
export function partySeriesDocument(result: PartySeriesResult): PartySeriesDocument | null {
  const seats = storedSeats(result.seats);
  const parsed = partySeriesDocumentSchema.safeParse({
    seriesId: result.seriesId,
    roomId: result.roomId,
    players: humans(result.seats),
    seats,
    wins: result.wins,
    rounds: result.rounds,
    winner: result.winnerSeat === null ? null : seats[result.winnerSeat],
    reason: result.reason
  });
  return parsed.success ? parsed.data : null;
}
