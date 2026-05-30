import { z } from "zod";

export const matchResultSchema = z.object({
  mode: z.enum(["player-vs-bot", "bot-skirmish"]).default("player-vs-bot"),
  winner: z.enum(["player", "bot", "bot-a", "bot-b", "draw"]).default("draw"),
  durationMs: z.number().int().min(0).max(1000 * 60 * 60).default(0),
  blocksCleared: z.number().int().min(0).max(500).default(0)
}).superRefine((match, context) => {
  if (match.mode === "player-vs-bot" && (match.winner === "bot-a" || match.winner === "bot-b")) {
    context.addIssue({
      code: "custom",
      message: "Player-vs-bot matches must use player, bot, or draw winners",
      path: ["winner"]
    });
  }

  if (match.mode === "bot-skirmish" && (match.winner === "player" || match.winner === "bot")) {
    context.addIssue({
      code: "custom",
      message: "Bot skirmishes must use bot-a, bot-b, or draw winners",
      path: ["winner"]
    });
  }
});

export type MatchResultInput = z.infer<typeof matchResultSchema>;
