import type { GameMode } from "../modes";
import { clampSpecialDropRates, type SpecialDropRates } from "./powerups";

/** Every place a round is played: the four local modes plus the two server rooms. */
export type PerkMode = GameMode | "duel" | "party";

/**
 * Which perks each mode drops, and how often (0–10). Null drops none. A campaign stage
 * or Daily Fuse modifier can still override its mode's entry. The two-seat duel keeps
 * shield, kick and remote off so its physics stay as they were; it drops only Vision.
 */
export const MODE_PERK_DROP_RATES: Record<PerkMode, SpecialDropRates | null> = {
  "player-vs-bot": { shield: 3, vision: 3 },
  "bot-skirmish": { shield: 3, vision: 3 },
  // Blast zones are hidden by default, so Vision drops everywhere a person plays.
  campaign: { vision: 3 },
  daily: { vision: 3 },
  duel: { vision: 3 },
  party: { shield: 3, vision: 3 }
};

/** The mode's perk rates, clamped, or null when the mode drops none. */
export function perkDropRatesFor(mode: PerkMode): SpecialDropRates | null {
  const rates = MODE_PERK_DROP_RATES[mode];
  const clamped = rates ? clampSpecialDropRates(rates) : null;
  return clamped && Object.keys(clamped).length > 0 ? clamped : null;
}
