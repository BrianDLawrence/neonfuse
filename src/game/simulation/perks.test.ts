import { describe, expect, it } from "vitest";
import { MODE_PERK_DROP_RATES, perkDropRatesFor, type PerkMode } from "./perks";

describe("perk drop rates by mode", () => {
  it("keeps the two-seat duel free of shield, kick and remote", () => {
    const duel = perkDropRatesFor("duel") ?? {};
    expect(duel.shield ?? 0).toBe(0);
    expect(duel.kick ?? 0).toBe(0);
    expect(duel.remote ?? 0).toBe(0);
  });

  it("drops shields in Versus, Bot Skirmish and Party Brawl", () => {
    for (const mode of ["player-vs-bot", "bot-skirmish", "party"] as PerkMode[]) {
      expect(perkDropRatesFor(mode)?.shield).toBeGreaterThan(0);
    }
  });

  it("drops Kick in Versus, Bot Skirmish and Party Brawl", () => {
    for (const mode of ["player-vs-bot", "bot-skirmish", "party"] as PerkMode[]) {
      expect(perkDropRatesFor(mode)?.kick).toBeGreaterThan(0);
    }
  });

  it("drops Vision in every mode, since blast zones are hidden without it", () => {
    for (const mode of Object.keys(MODE_PERK_DROP_RATES) as PerkMode[]) {
      expect(perkDropRatesFor(mode)?.vision).toBeGreaterThan(0);
    }
  });

  it("keeps campaign and Daily Fuse to Vision alone, so stage balance holds", () => {
    expect(perkDropRatesFor("campaign")).toEqual({ vision: 3 });
    expect(perkDropRatesFor("daily")).toEqual({ vision: 3 });
  });

  it("keeps every rate within 0-10", () => {
    for (const rates of Object.values(MODE_PERK_DROP_RATES)) {
      for (const rate of Object.values(rates ?? {})) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(10);
      }
    }
  });
});
