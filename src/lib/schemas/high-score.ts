import { z } from "zod";

export const highScoreModeSchema = z.enum(["all", "player-vs-bot", "bot-skirmish"]).default("all");

export const highScoreInitialsSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Initials must be exactly 3 letters"));

export const highScoreSubmitSchema = z.object({
  matchId: z.string().min(1),
  visitorId: z.string().uuid(),
  initials: highScoreInitialsSchema
});

export type HighScoreMode = z.infer<typeof highScoreModeSchema>;
export type HighScoreSubmitInput = z.infer<typeof highScoreSubmitSchema>;
