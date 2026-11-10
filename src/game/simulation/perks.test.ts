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

  it("keeps every rate within 0-10", () => {
    for (const rates of Object.values(MODE_PERK_DROP_RATES)) {
      for (const rate of Object.values(rates ?? {})) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(10);
      }
    }
  });
});
