export type GameMode = "player-vs-bot" | "bot-skirmish" | "campaign";

export const DEFAULT_GAME_MODE: GameMode = "player-vs-bot";

/** Modes where the human player is on the board (and the bot fights them). */
export function hasHumanPlayer(mode: GameMode): boolean {
  return mode === "player-vs-bot" || mode === "campaign";
}
