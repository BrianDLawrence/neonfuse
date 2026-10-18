import type { BotId } from "./bots";

export type RoundActorState = {
  id: "player" | BotId;
  alive: boolean;
};

export type RoundOutcome = "player" | "bot" | "draw" | BotId;

/**
 * Decides whether a round is over after knockouts are applied, or returns null
 * to keep playing.
 *
 * With a player on the board (local, campaign, gauntlet), the player wins once
 * every bot is down and the player is still standing; the bots win if the player
 * goes down while any bot stands; everyone going down together is a draw.
 * Without a player (skirmish), the last bot standing wins.
 */
export function resolveRoundWinner(actors: RoundActorState[]): RoundOutcome | null {
  const player = actors.find((actor) => actor.id === "player");
  const liveBots = actors.filter((actor) => actor.id !== "player" && actor.alive);

  if (player) {
    if (!player.alive) {
      return liveBots.length === 0 ? "draw" : "bot";
    }

    return liveBots.length === 0 ? "player" : null;
  }

  if (liveBots.length === 0) {
    return "draw";
  }

  return liveBots.length === 1 ? (liveBots[0].id as BotId) : null;
}
