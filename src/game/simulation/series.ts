import type { Seat } from "./duel";

export const SERIES_TARGET_WINS = 2;
export const SERIES_MAX_ROUNDS = 5;

/** Round wins belong to whoever holds the seat; a newcomer starts from zero. */
export type SeriesSeat = { occupant: string; wins: number };
export type SeriesOutcome = { reason: "won" | "cap"; winnerSeat: Seat | null };
export type SeriesState = {
  seats: (SeriesSeat | null)[];
  rounds: number;
  outcome: SeriesOutcome | null;
};

/** `occupants` are stable keys such as `human:<playerId>` or `bot:<seat>`, one per seat. */
export function createSeries(occupants: (string | null)[]): SeriesState {
  return {
    seats: occupants.map((occupant) => (occupant ? { occupant, wins: 0 } : null)),
    rounds: 0,
    outcome: null
  };
}

/** Seats a new occupant between rounds; the previous occupant's wins leave with it. */
export function seatSeriesOccupant(series: SeriesState, seat: Seat, occupant: string | null): SeriesState {
  if ((series.seats[seat]?.occupant ?? null) === occupant) return series;
  const seats = [...series.seats];
  seats[seat] = occupant ? { occupant, wins: 0 } : null;
  return { ...series, seats };
}

/** First to two round wins takes the series; after five rounds the leader wins and a tie is a draw. */
export function recordSeriesRound(series: SeriesState, winner: Seat | "draw"): SeriesState {
  if (series.outcome) return series;
  const seats = series.seats.map((seat, index) =>
    seat && index === winner ? { ...seat, wins: seat.wins + 1 } : seat
  );
  const rounds = series.rounds + 1;
  const champion = seats.findIndex((seat) => !!seat && seat.wins >= SERIES_TARGET_WINS);
  if (champion >= 0) return { seats, rounds, outcome: { reason: "won", winnerSeat: champion as Seat } };
  if (rounds < SERIES_MAX_ROUNDS) return { seats, rounds, outcome: null };
  const best = Math.max(0, ...seats.map((seat) => seat?.wins ?? 0));
  const leaders = seats.flatMap((seat, index) => (seat && best > 0 && seat.wins === best ? [index as Seat] : []));
  return { seats, rounds, outcome: { reason: "cap", winnerSeat: leaders.length === 1 ? leaders[0] : null } };
}
