import { describe, expect, it } from "vitest";
import { createSeries, recordSeriesRound, seatSeriesOccupant, SERIES_MAX_ROUNDS } from "./series";

const FOUR = ["human:a", "human:b", "bot:2", "bot:3"];

describe("best-of-three party series", () => {
  it("is won by the first occupant to two round wins", () => {
    let series = createSeries(FOUR);
    series = recordSeriesRound(series, 1);
    expect(series.outcome).toBeNull();
    series = recordSeriesRound(series, 0);
    series = recordSeriesRound(series, 1);
    expect(series.outcome).toEqual({ reason: "won", winnerSeat: 1 });
    expect(series.seats.map((seat) => seat?.wins)).toEqual([1, 2, 0, 0]);
    expect(series.rounds).toBe(3);
    expect(recordSeriesRound(series, 0)).toBe(series);
  });

  it("does not count drawn rounds as wins", () => {
    let series = recordSeriesRound(createSeries(FOUR), "draw");
    series = recordSeriesRound(series, "draw");
    expect(series.seats.every((seat) => seat?.wins === 0)).toBe(true);
    expect(series.rounds).toBe(2);
    expect(series.outcome).toBeNull();
  });

  it("lets a bot win the series", () => {
    let series = recordSeriesRound(createSeries(FOUR), 3);
    series = recordSeriesRound(series, 3);
    expect(series.outcome).toEqual({ reason: "won", winnerSeat: 3 });
  });

  it("caps the series, giving it to the leader or calling a tie a draw", () => {
    let leader = createSeries(FOUR);
    for (const winner of [0, "draw", "draw", "draw", "draw"] as const) leader = recordSeriesRound(leader, winner);
    expect(leader.rounds).toBe(SERIES_MAX_ROUNDS);
    expect(leader.outcome).toEqual({ reason: "cap", winnerSeat: 0 });

    let tied = createSeries(FOUR);
    for (const winner of [0, 1, "draw", "draw", "draw"] as const) tied = recordSeriesRound(tied, winner);
    expect(tied.outcome).toEqual({ reason: "cap", winnerSeat: null });
  });

  it("gives a newcomer a fresh record and drops the replaced occupant's wins", () => {
    let series = recordSeriesRound(createSeries(FOUR), 2);
    expect(seatSeriesOccupant(series, 2, "bot:2")).toBe(series);
    series = seatSeriesOccupant(series, 2, "human:c");
    expect(series.seats[2]).toEqual({ occupant: "human:c", wins: 0 });
    series = seatSeriesOccupant(series, 3, null);
    expect(series.seats[3]).toBeNull();
    expect(series.rounds).toBe(1);
  });
});
