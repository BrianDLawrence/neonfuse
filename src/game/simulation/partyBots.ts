import type { GridPoint } from "./arena";
import { BOT_PROFILES, chooseBotTurn, type BotProfileId, type BotTurnContext, type BotTurnIntent } from "./bots";
import { isDangerTile, manhattanDistance } from "./danger";
import { commandDuel, type DuelCommand, type DuelState, type Seat } from "./duel";
import { slideAwareThreats } from "./kick";
import { chooseBotDetonation } from "./remote";
import { hashString } from "./seed";

/** Each party seat has a fixed Fusebot; a bot filling that seat plays this profile. */
export const PARTY_SEAT_PROFILES: readonly BotProfileId[] = ["circuit-shade", "fuse-rush", "volt-warden", "glitch-bloom"];

/** A party bot holds a remote bomb no longer than a normal fuse before setting it off. */
export const PARTY_BOT_REMOTE_HOLD_MS = 1400;

/** Bots wait a beat after the countdown, like local bots do. */
export const PARTY_BOT_START_DELAY_MS = 280;

export type PartyBot = {
  seat: Seat;
  profileId: BotProfileId;
  turn: number;
  nextDecisionAt: number;
};

export function createPartyBot(seat: Seat, startsAt: number): PartyBot {
  return { seat, profileId: PARTY_SEAT_PROFILES[seat], turn: 0, nextDecisionAt: startsAt + PARTY_BOT_START_DELAY_MS };
}

/** A per-round seed in the same range local rounds use, derived from the server's round ID. */
export function partyRoundSeed(roundId: string): number {
  return (hashString(roundId) % 1_000_000) + 1;
}

function decisionSeed(roundSeed: number, bot: PartyBot) {
  return roundSeed + bot.turn * 101 + bot.seat * 9_973;
}

/** The same pacing as local bots (slower with less speed), plus seeded jitter of up to 90 ms. */
export function partyBotDelay(speed: number, seed: number): number {
  const jitter = ((((seed * 13) % 181) + 181) % 181) - 90;
  return Math.max(260, 560 - speed * 70) + jitter;
}

/** The closest living rival by grid distance; ties go to the lower seat. */
export function nearestOpponent(state: DuelState, seat: Seat): Seat | null {
  const self = state.players[seat];
  let best: { seat: Seat; distance: number } | null = null;
  state.players.forEach((player, index) => {
    if (index === seat || !player.alive) return;
    const distance = manhattanDistance(self.tile, player.tile);
    if (!best || distance < best.distance) best = { seat: index as Seat, distance };
  });
  return (best as { seat: Seat } | null)?.seat ?? null;
}

function stepToward(from: GridPoint, to: GridPoint): DuelCommand | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  return { type: "move", direction: dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up" };
}

/**
 * Reuses the local bot brain for one decision, turned into the commands a human
 * could send. The server applies them through commandDuel, so bots get no rule
 * a human does not: same move cooldown, bomb cap and fuse.
 */
export function choosePartyBotCommands(state: DuelState, bot: PartyBot, seed: number): DuelCommand[] {
  const actor = state.players[bot.seat];
  const target = nearestOpponent(state, bot.seat);
  if (!actor?.alive || target === null) return [];
  const context: BotTurnContext = {
    arena: state.arena,
    actor: { id: "bot-a", tile: actor.tile, alive: true, loadout: actor.loadout, profile: BOT_PROFILES[bot.profileId], turn: bot.turn },
    opponentTile: state.players[target].tile,
    // A kicked bomb is a threat where it will stop as well as where it is.
    bombs: slideAwareThreats({ arena: state.arena, fighters: state.players.filter((player) => player.alive).map((player) => player.tile) }, state.bombs),
    activeBombCount: state.bombs.filter((bomb) => bomb.owner === bot.seat).length,
    blockedTiles: [
      ...state.bombs.map((bomb) => bomb.tile),
      ...state.players.filter((player, index) => index !== bot.seat && player.alive).map((player) => player.tile)
    ],
    powerups: state.powerups,
    decisionSeed: seed
  };
  // A bot holding Remote sets off its bomb once it is clear and a rival is caught, or once
  // the bomb has been held for the normal fuse, so remote bombs keep the usual pace.
  const rivals = state.players.filter((player, index) => index !== bot.seat && player.alive).map((player) => player.tile);
  const detonate: DuelCommand[] = chooseBotDetonation({
    arena: state.arena, owner: bot.seat, actorTile: actor.tile, rivals, bombs: state.bombs, time: state.time, holdMs: PARTY_BOT_REMOTE_HOLD_MS
  }) === null ? [] : [{ type: "detonate" }];
  const intent = choosePressingTurn(context) ?? chooseBotTurn(context);
  if (intent.type === "wait") return detonate;
  if (intent.type === "move") {
    const move = stepToward(actor.tile, intent.tile);
    return move ? [...detonate, move] : detonate;
  }
  const escape = intent.moveTo ? stepToward(actor.tile, intent.moveTo) : null;
  return [...detonate, { type: "bomb" }, ...(escape ? [escape] : [])];
}

/**
 * Party-only pressure. The local brain holds still while any bomb is live, which with
 * four fighters is most of the round, so bot-only rounds ran out the clock. When the bot
 * is out of every blast, it plans as if the board were clear and keeps that plan only if
 * it stays safe against the live bombs: a move must not enter a blast, and a bomb needs an
 * escape that also clears them. Otherwise (or when it is in danger) the local brain decides.
 */
export function choosePressingTurn(context: BotTurnContext): BotTurnIntent | null {
  const { arena, actor, bombs } = context;
  if (bombs.length === 0 || isDangerTile(arena, bombs, actor.tile)) return null;
  const plan = chooseBotTurn({ ...context, bombs: [] });
  if (plan.type === "move") return isDangerTile(arena, bombs, plan.tile) ? null : plan;
  if (plan.type === "wait") return null;
  const escape = chooseBotTurn({ ...context, bombs: [...bombs, { tile: actor.tile, range: actor.loadout.blast }] });
  return escape.type === "move" ? { type: "plant-bomb", moveTo: escape.tile } : null;
}

/** Lets every living bot whose turn is due act at the state's current time, in seat order. */
export function stepPartyBots(state: DuelState, bots: PartyBot[], roundSeed: number): { state: DuelState; bots: PartyBot[] } {
  let next = state;
  const stepped = bots.map((bot) => {
    if (next.winner !== null || next.time < next.startsAt || next.time < bot.nextDecisionAt || !next.players[bot.seat]?.alive) return bot;
    const seed = decisionSeed(roundSeed, bot);
    for (const command of choosePartyBotCommands(next, bot, seed)) next = commandDuel(next, bot.seat, command);
    return { ...bot, turn: bot.turn + 1, nextDecisionAt: next.time + partyBotDelay(next.players[bot.seat].loadout.speed, seed) };
  });
  return { state: next, bots: stepped };
}
