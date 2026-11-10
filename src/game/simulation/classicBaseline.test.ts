import { describe, expect, it } from "vitest";
import { createArena, isWalkable, type ArenaGrid, type ArenaPresetId } from "./arena";
import { BOT_PROFILE_ORDER, BOT_PROFILES, chooseBotTurn, type BotTurnIntent } from "./bots";
import { CAMPAIGN_STAGES, resolveStageBot, resolveStageModifiers } from "./campaign";
import { DAILY_MODIFIERS } from "./daily";
import { advanceDuel, createDuel, type DuelState } from "./duel";
import { createPartyBot, stepPartyBots } from "./partyBots";
import { choosePowerupDrop, createInitialLoadout, DEFAULT_POWERUP_DROP_RATES, type PowerupDropRates } from "./powerups";
import { hashString } from "./seed";

/**
 * Guards the classic rules while new pickups land. Each check pins today's behaviour
 * with the new pickups switched off, so campaign par times, stars, Daily Fuse days and
 * bot play cannot shift without this file changing too.
 */

/** The drop roll exactly as it shipped before the new pickups, kept as a reference. */
function legacyDrop(tile: { x: number; y: number }, rates: PowerupDropRates): string | null {
  const salts = { bomb: 11, blast: 37, speed: 23 } as const;
  const candidates = (["bomb", "blast", "speed"] as const)
    .map((type) => {
      const threshold = Math.min(10, Math.max(1, Math.round(rates[type]))) * 6;
      const roll = (((tile.x * 31 + tile.y * 17 + salts[type]) % 100) + 100) % 100;
      return { type, score: roll / threshold, shouldDrop: roll < threshold };
    })
    .filter((candidate) => candidate.shouldDrop);
  return candidates.length === 0 ? null : candidates.sort((a, b) => a.score - b.score)[0].type;
}

const RATE_SETS: PowerupDropRates[] = [
  DEFAULT_POWERUP_DROP_RATES,
  ...CAMPAIGN_STAGES.flatMap((stage) => stage.modifiers.powerupDropRates ?? []),
  ...DAILY_MODIFIERS.flatMap((modifier) => modifier.modifiers.powerupDropRates ?? [])
];

function intentKey(intent: BotTurnIntent) {
  if (intent.type === "wait") return "w";
  if (intent.type === "move") return `m${intent.tile.x},${intent.tile.y}`;
  return `b${intent.moveTo ? `${intent.moveTo.x},${intent.moveTo.y}` : ""}`;
}

describe("classic baseline", () => {
  it("drops exactly the classic powerups on every tile when new pickups are off", () => {
    for (const rates of RATE_SETS) {
      for (let y = 0; y < 31; y += 1) {
        for (let x = 0; x < 31; x += 1) {
          if (choosePowerupDrop({ x, y }, rates) !== legacyDrop({ x, y }, rates)) {
            throw new Error(`Drop changed at ${x},${y} for ${JSON.stringify(rates)}`);
          }
        }
      }
    }
  });

  it("keeps every campaign stage's bots and modifiers on their classic values", () => {
    const initial = createInitialLoadout();
    for (const stage of CAMPAIGN_STAGES) {
      const modifiers = resolveStageModifiers(stage);
      expect(modifiers.botFuseMs).toBeGreaterThanOrEqual(1200);
      for (const spec of stage.bots) {
        const { loadout } = resolveStageBot(spec);
        expect(loadout.bombs).toBe(spec.startingLoadout?.bombs ?? initial.bombs);
        expect(loadout.blast).toBe(spec.startingLoadout?.blast ?? initial.blast);
        expect(loadout.speed).toBe(spec.startingLoadout?.speed ?? initial.speed);
      }
    }
  });

  it("keeps bot decisions on classic boards identical", () => {
    const keys: string[] = [];
    const presets: ArenaPresetId[] = ["standard", "open-core", "maze"];
    for (const preset of presets) {
      const arena: ArenaGrid = createArena({ cols: 13, rows: 11, preset }, 2);
      for (const profileId of BOT_PROFILE_ORDER) {
        for (let y = 1; y < 10; y += 1) {
          for (let x = 1; x < 12; x += 1) {
            if (!isWalkable(arena, { x, y })) continue;
            for (const bombs of [[], [{ tile: { x: 6, y: 5 }, range: 2 }]]) {
              keys.push(intentKey(chooseBotTurn({
                arena,
                actor: { id: "bot-a", tile: { x, y }, alive: true, loadout: createInitialLoadout(), profile: BOT_PROFILES[profileId], turn: x + y },
                opponentTile: { x: 11, y: 9 },
                bombs,
                activeBombCount: 0,
                powerups: [{ tile: { x: 3, y: 1 }, type: "blast" }, { tile: { x: 7, y: 9 }, type: "speed" }],
                decisionSeed: x * 7 + y
              })));
            }
          }
        }
      }
    }
    expect(keys.length).toBeGreaterThan(700);
    expect(hashString(keys.join("|"))).toBe(BOT_DECISION_FINGERPRINT);
  });

  it("plays a classic four-bot party round to the same finish", () => {
    let state: DuelState = createDuel(4);
    let bots = [0, 1, 2, 3].map((seat) => createPartyBot(seat as 0 | 1 | 2 | 3, state.startsAt));
    for (let time = 0; time <= 183_000 && state.winner === null; time += 50) {
      state = advanceDuel(state, time);
      ({ state, bots } = stepPartyBots(state, bots, 424_242));
    }
    expect({ winner: state.winner, reason: state.reason, time: state.time }).toEqual(PARTY_ROUND_FINISH);
  });
});

const BOT_DECISION_FINGERPRINT = 3494860014;
const PARTY_ROUND_FINISH = { winner: 0, reason: "blast", time: 31_850 };
