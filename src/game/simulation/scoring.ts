import type { GameMode } from "../modes";

export type ScoreWinner = "player" | "bot" | "bot-a" | "bot-b" | "draw";

export type ScoreInput = {
  mode: GameMode;
  winner: ScoreWinner;
  durationMs: number;
  blocksCleared: number;
};

const MODE_BONUS: Record<GameMode, number> = {
  "player-vs-bot": 1000,
  "bot-skirmish": 700
};

const WINNER_BONUS: Record<ScoreWinner, number> = {
  player: 3000,
  bot: 500,
  "bot-a": 1800,
  "bot-b": 1800,
  draw: 900
};

export function calculateRoundScore({ mode, winner, durationMs, blocksCleared }: ScoreInput) {
  const durationSeconds = Math.max(0, Math.round(durationMs / 1000));
  const speedBonus = Math.max(0, 180 - durationSeconds) * 12;
  const blockBonus = Math.max(0, blocksCleared) * 125;

  return Math.max(0, Math.round(MODE_BONUS[mode] + WINNER_BONUS[winner] + blockBonus + speedBonus));
}
