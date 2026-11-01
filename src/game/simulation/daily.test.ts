import { describe, expect, it } from "vitest";
import {
  DAILY_BOARDS,
  DAILY_MODIFIERS,
  EMPTY_DAILY_PROGRESS,
  applyDailyWin,
  deriveDailyProgress,
  getCurrentStreak,
  getDailyChallenge,
  getDailyOpponents,
  isDailyCleared,
  isDailyDateKey,
  isDailyKeyInWindow,
  resolveDailyModifiers,
  sanitizeDailyProgress,
  shiftDateKey,
  utcDateKey,
  type DailyChallenge,
  type DailyWin
} from "./daily";
import { ARENA_COLS, ARENA_ROWS, createArena, getSpawnPoints, isValidArenaSize } from "./arena";
import { resolveStageBot } from "./campaign";
import { computeFollowCamera } from "./layout";
import { MAX_LOADOUT, createInitialLoadout } from "./powerups";

const CELL = 48;

/** A run of consecutive date keys, built without reading the clock. */
function daysFrom(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftDateKey(start, index));
}

const YEAR = daysFrom("2026-01-01", 365);
const challenges = YEAR.map((key) => getDailyChallenge(key) as DailyChallenge);

function win(dateKey: string, durationMs = 60_000): DailyWin {
  return { dateKey, durationMs };
}

describe("daily date keys", () => {
  it("accepts real calendar dates in YYYY-MM-DD form", () => {
    expect(isDailyDateKey("2026-11-01")).toBe(true);
    expect(isDailyDateKey("2028-02-29")).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    for (const value of ["2026-2-01", "2026-02-30", "2027-02-29", "2026-13-01", "26-11-01", "2026-11-01T00:00", "", 20261101, null]) {
      expect(isDailyDateKey(value)).toBe(false);
    }
  });

  it("formats a Date as its UTC day", () => {
    expect(utcDateKey(new Date(Date.UTC(2026, 10, 1, 23, 59, 59)))).toBe("2026-11-01");
    expect(utcDateKey(new Date(Date.UTC(2026, 10, 2, 0, 0, 0)))).toBe("2026-11-02");
  });

  it("shifts across month, year and leap-day boundaries", () => {
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDateKey("2026-11-01", 0)).toBe("2026-11-01");
  });
});

describe("daily date window", () => {
  const now = Date.UTC(2026, 10, 1, 12, 0, 0);

  it("accepts today's UTC date and one day either side", () => {
    expect(isDailyKeyInWindow("2026-10-31", now)).toBe(true);
    expect(isDailyKeyInWindow("2026-11-01", now)).toBe(true);
    expect(isDailyKeyInWindow("2026-11-02", now)).toBe(true);
  });

  it("rejects stale, future and malformed dates", () => {
    expect(isDailyKeyInWindow("2026-10-30", now)).toBe(false);
    expect(isDailyKeyInWindow("2026-11-03", now)).toBe(false);
    expect(isDailyKeyInWindow("2026-11-31", now)).toBe(false);
  });

  it("uses the UTC day at the edges of the window", () => {
    const justBeforeMidnight = Date.UTC(2026, 10, 1, 23, 59, 59);
    const justAfterMidnight = Date.UTC(2026, 10, 2, 0, 0, 1);

    expect(isDailyKeyInWindow("2026-10-31", justBeforeMidnight)).toBe(true);
    expect(isDailyKeyInWindow("2026-10-31", justAfterMidnight)).toBe(false);
  });
});

describe("getDailyChallenge", () => {
  it("returns null for a malformed key", () => {
    expect(getDailyChallenge("not-a-date")).toBeNull();
    expect(getDailyChallenge("2026-02-30")).toBeNull();
  });

  it("is deterministic: the same date always builds the same challenge", () => {
    expect(getDailyChallenge("2026-11-01")).toEqual(getDailyChallenge("2026-11-01"));
    YEAR.forEach((key, index) => expect(getDailyChallenge(key)).toEqual(challenges[index]));
  });

  it("varies across a year of dates", () => {
    const signature = (challenge: DailyChallenge) =>
      JSON.stringify([challenge.arena, challenge.arenaSeed, challenge.bots, challenge.modifier.id]);

    expect(new Set(challenges.map(signature)).size).toBeGreaterThan(300);
    expect(new Set(challenges.map((challenge) => challenge.modifier.id)).size).toBe(DAILY_MODIFIERS.length);
    expect(new Set(challenges.map((challenge) => `${challenge.arena.cols}x${challenge.arena.rows}`)).size).toBe(
      DAILY_BOARDS.length
    );
    expect(new Set(challenges.map((challenge) => challenge.arena.preset))).toEqual(
      new Set(["standard", "open-core", "maze"])
    );
    expect(new Set(challenges.map((challenge) => challenge.bots.length))).toEqual(new Set([1, 2]));
  });

  it("rotates the modifier every day", () => {
    challenges.slice(1).forEach((challenge, index) => {
      expect(challenge.modifier.id).not.toBe(challenges[index].modifier.id);
    });
  });

  it("keeps every board a valid, buildable arena with clear spawns", () => {
    for (const challenge of challenges) {
      const { cols, rows } = challenge.arena;
      const arena = createArena(challenge.arena, challenge.arenaSeed);

      expect(isValidArenaSize(cols, rows)).toBe(true);
      expect(cols).toBeLessThanOrEqual(19);
      expect(rows).toBeLessThanOrEqual(15);
      getSpawnPoints(arena)
        .slice(0, challenge.bots.length + 1)
        .forEach((spawn) => expect(arena[spawn.y][spawn.x]).toBe("floor"));
    }
  });

  it("keeps most days on the fit-to-screen camera on phones and laptops", () => {
    const fits = (challenge: DailyChallenge, width: number, height: number, touchControlsVisible: boolean) => {
      const { cols, rows } = challenge.arena;
      return (
        computeFollowCamera(width, height, cols * CELL, rows * CELL, {
          cellSize: CELL,
          touchControlsVisible,
          // Mirrors ArenaScene.applyCamera.
          reserveDesktopHud: cols > ARENA_COLS || rows > ARENA_ROWS
        }).mode === "fit"
      );
    };
    const share = (predicate: (challenge: DailyChallenge) => boolean) =>
      challenges.filter(predicate).length / challenges.length;

    expect(share((challenge) => fits(challenge, 412, 839, true))).toBeGreaterThanOrEqual(0.7);
    expect(share((challenge) => fits(challenge, 390, 844, true))).toBeGreaterThanOrEqual(0.7);
    expect(share((challenge) => fits(challenge, 1280, 720, false))).toBeGreaterThanOrEqual(0.9);
  });

  it("fields one or two distinct roster bots, and two only on standard-size boards or larger", () => {
    for (const challenge of challenges) {
      const ids = challenge.bots.map((bot) => bot.profileId);

      expect(ids.length === 1 || ids.length === 2).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);

      if (ids.length === 2) {
        expect(challenge.arena.cols * challenge.arena.rows).toBeGreaterThanOrEqual(ARENA_COLS * ARENA_ROWS);
      }

      expect(getDailyOpponents(challenge).map((profile) => profile.id)).toEqual(ids);
    }
  });

  it("keeps bot tuning inside the stage bounds", () => {
    const initial = createInitialLoadout();

    for (const challenge of challenges) {
      for (const spec of challenge.bots) {
        for (const delta of Object.values(spec.traitDelta ?? {})) {
          expect(Math.abs(delta)).toBeLessThanOrEqual(1);
        }

        const { profile, loadout } = resolveStageBot(spec);

        Object.values(profile.traits).forEach((value) => {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(10);
        });
        expect(loadout.bombs).toBeGreaterThanOrEqual(initial.bombs);
        expect(loadout.bombs).toBeLessThanOrEqual(Math.min(2, MAX_LOADOUT.bombs));
        expect(loadout.blast).toBeGreaterThanOrEqual(initial.blast);
        expect(loadout.blast).toBeLessThanOrEqual(Math.min(3, MAX_LOADOUT.blast));
        expect(loadout.speed).toBe(initial.speed);
      }
    }
  });

  it("keeps every modifier inside the clamped bounds, with bot fuses of 1.5s or more", () => {
    for (const modifier of DAILY_MODIFIERS) {
      const challenge = challenges.find((candidate) => candidate.modifier.id === modifier.id) as DailyChallenge;
      const resolved = resolveDailyModifiers(challenge);

      // The table already sits inside the bounds, so clamping changes nothing.
      if (modifier.modifiers.botFuseMs !== undefined) {
        expect(resolved.botFuseMs).toBe(modifier.modifiers.botFuseMs);
      }
      if (modifier.modifiers.botMoveScale !== undefined) {
        expect(resolved.botMoveScale).toBe(modifier.modifiers.botMoveScale);
      }
      if (modifier.modifiers.powerupDropRates) {
        expect(resolved.powerupDropRates).toEqual(modifier.modifiers.powerupDropRates);
      }

      expect(resolved.botFuseMs).toBeGreaterThanOrEqual(1500);
      expect(resolved.botFuseMs).toBeLessThanOrEqual(2400);
      expect(resolved.botMoveScale).toBeGreaterThanOrEqual(0.7);
      expect(resolved.botMoveScale).toBeLessThanOrEqual(1.3);
    }
  });

  it("gives every modifier a unique id and label", () => {
    expect(new Set(DAILY_MODIFIERS.map((modifier) => modifier.id)).size).toBe(DAILY_MODIFIERS.length);
    expect(new Set(DAILY_MODIFIERS.map((modifier) => modifier.label)).size).toBe(DAILY_MODIFIERS.length);
  });
});

describe("daily streak fold", () => {
  it("starts empty", () => {
    expect(deriveDailyProgress([])).toEqual(EMPTY_DAILY_PROGRESS);
    expect(getCurrentStreak(EMPTY_DAILY_PROGRESS, "2026-11-01")).toBe(0);
  });

  it("counts consecutive days as one streak", () => {
    const progress = deriveDailyProgress(daysFrom("2026-10-28", 5).map((key) => win(key)));

    expect(progress.totalClears).toBe(5);
    expect(progress.longestStreak).toBe(5);
    expect(progress.runLength).toBe(5);
    expect(progress.lastClearedKey).toBe("2026-11-01");
  });

  it("restarts the streak after a missed day but keeps the longest", () => {
    const progress = deriveDailyProgress(
      ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"].map((key) => win(key))
    );

    expect(progress.totalClears).toBe(5);
    expect(progress.longestStreak).toBe(3);
    expect(progress.runLength).toBe(2);
  });

  it("counts a day once however many times it was cleared, keeping its fastest time", () => {
    const progress = deriveDailyProgress([
      win("2026-11-01", 90_000),
      win("2026-11-01", 45_000),
      win("2026-11-01", 70_000)
    ]);

    expect(progress.totalClears).toBe(1);
    expect(progress.longestStreak).toBe(1);
    expect(progress.bestTimeMs).toBe(45_000);
    expect(progress.recent).toEqual({ "2026-11-01": 45_000 });
  });

  it("gives the same answer for out-of-order input", () => {
    const ordered = ["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06"].map((key, index) =>
      win(key, 50_000 + index * 1000)
    );
    const shuffled = [ordered[3], ordered[0], ordered[4], ordered[1], ordered[2], ordered[0]];

    expect(deriveDailyProgress(shuffled)).toEqual(deriveDailyProgress(ordered));
  });

  it("tracks the fastest clear across all days", () => {
    const progress = deriveDailyProgress([win("2026-10-01", 80_000), win("2026-10-09", 31_000), win("2026-10-20", 55_000)]);

    expect(progress.bestTimeMs).toBe(31_000);
  });

  it("ignores rows with malformed dates or durations", () => {
    const progress = deriveDailyProgress([
      win("2026-10-01"),
      win("2026-02-30"),
      { dateKey: "2026-10-02", durationMs: Number.NaN },
      { dateKey: "2026-10-03", durationMs: -5 }
    ]);

    expect(progress.totalClears).toBe(1);
  });

  it("keeps only the three most recent cleared days for the today check", () => {
    const progress = deriveDailyProgress(daysFrom("2026-10-25", 8).map((key) => win(key)));

    expect(Object.keys(progress.recent).sort()).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("keeps the streak alive through today when yesterday was cleared, then drops it", () => {
    const progress = deriveDailyProgress(daysFrom("2026-10-29", 3).map((key) => win(key)));

    expect(getCurrentStreak(progress, "2026-10-31")).toBe(3);
    expect(getCurrentStreak(progress, "2026-11-01")).toBe(3);
    expect(getCurrentStreak(progress, "2026-11-02")).toBe(0);
  });

  it("reports whether a given day is cleared", () => {
    const progress = deriveDailyProgress([win("2026-10-31"), win("2026-11-01")]);

    expect(isDailyCleared(progress, "2026-11-01")).toBe(true);
    expect(isDailyCleared(progress, "2026-10-31")).toBe(true);
    expect(isDailyCleared(progress, "2026-11-02")).toBe(false);
  });

  it("applies a new win on top of derived progress the same way the fold does", () => {
    const wins = daysFrom("2026-10-28", 4).map((key) => win(key));
    const incremental = applyDailyWin(deriveDailyProgress(wins.slice(0, 3)), wins[3]);

    expect(incremental).toEqual(deriveDailyProgress(wins));
  });

  it("does not let an older day rewrite the streak when applied incrementally", () => {
    const progress = deriveDailyProgress([win("2026-10-30"), win("2026-11-01")]);
    const backfilled = applyDailyWin(progress, win("2026-10-20", 20_000));

    expect(backfilled.runLength).toBe(1);
    expect(backfilled.lastClearedKey).toBe("2026-11-01");
    expect(backfilled.totalClears).toBe(3);
    expect(backfilled.bestTimeMs).toBe(20_000);
  });
});

describe("sanitizeDailyProgress", () => {
  it("round-trips valid progress", () => {
    const progress = deriveDailyProgress(daysFrom("2026-10-25", 6).map((key) => win(key, 40_000)));

    expect(sanitizeDailyProgress(JSON.parse(JSON.stringify(progress)))).toEqual(progress);
  });

  it("drops anything that is not well-formed progress", () => {
    expect(sanitizeDailyProgress(null)).toEqual(EMPTY_DAILY_PROGRESS);
    expect(sanitizeDailyProgress("streak")).toEqual(EMPTY_DAILY_PROGRESS);
    expect(sanitizeDailyProgress({ totalClears: -1 })).toEqual(EMPTY_DAILY_PROGRESS);
    expect(
      sanitizeDailyProgress({
        totalClears: 2,
        longestStreak: 9,
        runLength: 1,
        lastClearedKey: "2026-11-01",
        bestTimeMs: 1000,
        recent: {}
      })
    ).toEqual(EMPTY_DAILY_PROGRESS);
    expect(
      sanitizeDailyProgress({
        totalClears: 2,
        longestStreak: 2,
        runLength: 2,
        lastClearedKey: "2026-13-40",
        bestTimeMs: 1000,
        recent: {}
      })
    ).toEqual(EMPTY_DAILY_PROGRESS);
  });

  it("filters bad entries out of the recent days", () => {
    const clean = sanitizeDailyProgress({
      totalClears: 2,
      longestStreak: 2,
      runLength: 2,
      lastClearedKey: "2026-11-01",
      bestTimeMs: 30_000,
      recent: { "2026-11-01": 30_000, "2026-10-31": "fast", nope: 1 }
    });

    expect(clean.recent).toEqual({ "2026-11-01": 30_000 });
    expect(clean.runLength).toBe(2);
  });
});
