import { describe, expect, it } from "vitest";
import { advanceDuel, createDuel, type DuelState, type Seat } from "./duel";
import {
  choosePartyBotCommands,
  createPartyBot,
  nearestOpponent,
  partyBotDelay,
  partyRoundSeed,
  PARTY_SEAT_PROFILES,
  stepPartyBots,
  type PartyBot
} from "./partyBots";

const SEATS: Seat[] = [0, 1, 2, 3];

function allBots(state: DuelState) {
  return SEATS.map((seat) => createPartyBot(seat, state.startsAt));
}

/** Runs a whole four-bot round on the server's 50 ms cadence. */
function playRound(roundId: string) {
  let state = createDuel(4);
  let bots = allBots(state);
  const seed = partyRoundSeed(roundId);
  for (let time = 0; state.winner === null && time <= 190_000; time += 50) {
    state = advanceDuel(state, time);
    ({ state, bots } = stepPartyBots(state, bots, seed));
    state.players.forEach((player, seat) => {
      expect(state.bombs.filter((bomb) => bomb.owner === seat).length).toBeLessThanOrEqual(player.loadout.bombs);
    });
  }
  return { state, bots };
}

describe("party bots", () => {
  it("gives each seat its own fixed profile and waits out the countdown", () => {
    expect(new Set(PARTY_SEAT_PROFILES).size).toBe(4);
    expect(createPartyBot(2, 3000)).toEqual({ seat: 2, profileId: "volt-warden", turn: 0, nextDecisionAt: 3280 });
    const before = createDuel(4);
    const bots = allBots(before);
    expect(stepPartyBots(before, bots, 1)).toEqual({ state: before, bots });
  });

  it("targets the nearest living rival and breaks ties by seat", () => {
    const state = createDuel(4);
    expect(nearestOpponent(state, 0)).toBe(3);
    state.players[2].tile = { x: 9, y: 1 };
    expect(nearestOpponent(state, 0)).toBe(2);
    state.players[2].alive = false;
    state.players[3].alive = false;
    expect(nearestOpponent(state, 0)).toBe(1);
    state.players[1].alive = false;
    expect(nearestOpponent(state, 0)).toBeNull();
  });

  it("steps off a bomb it is standing on", () => {
    const state = advanceDuel(createDuel(4), 3000);
    state.bombs.push({ id: 9, owner: 1, tile: { x: 1, y: 1 }, range: 2, explodesAt: 4400 });
    const [command] = choosePartyBotCommands(state, createPartyBot(0, 0), 77);
    expect(command).toMatchObject({ type: "move" });
  });

  it("plays only through commands, so cooldowns and turns advance", () => {
    let state = advanceDuel(createDuel(4), 3280);
    let bots: PartyBot[] = allBots(state);
    ({ state, bots } = stepPartyBots(state, bots, 42));
    expect(bots.every((bot) => bot.turn === 1 && bot.nextDecisionAt > 3280)).toBe(true);
    const again = stepPartyBots(state, bots, 42);
    expect(again.state).toBe(state);
    expect(again.bots).toEqual(bots);
  });

  it("skips fallen bots", () => {
    const state = advanceDuel(createDuel(4), 3280);
    state.players[1].alive = false;
    const { bots } = stepPartyBots(state, allBots(state), 7);
    expect(bots[1].turn).toBe(0);
  });

  it("keeps pacing near local bots and jitter within 90 ms", () => {
    for (let seed = 0; seed < 400; seed += 1) {
      const delay = partyBotDelay(1, seed);
      expect(delay).toBeGreaterThanOrEqual(400);
      expect(delay).toBeLessThanOrEqual(580);
    }
    expect(partyBotDelay(5, 3)).toBeGreaterThanOrEqual(170);
  });

  it("finishes a four-bot round deterministically within the round timer", () => {
    const first = playRound("round-abc");
    const second = playRound("round-abc");
    expect(first.state.winner).not.toBeNull();
    expect(first.state.time).toBeLessThanOrEqual(183_000);
    expect(second).toEqual(first);
  });
});
