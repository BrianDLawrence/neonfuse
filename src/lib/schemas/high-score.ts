import { z } from "zod";

export const highScoreModeSchema = z.enum(["all", "player-vs-bot", "bot-skirmish"]).default("all");

export const highScoreSubmitSchema = z.object({
  matchId: z.string().min(1)
});

export type HighScoreMode = z.infer<typeof highScoreModeSchema>;
export type HighScoreSubmitInput = z.infer<typeof highScoreSubmitSchema>;
