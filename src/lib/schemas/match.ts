import { z } from "zod";

export const matchResultSchema = z.object({
  winner: z.enum(["player", "bot", "draw"]).default("draw"),
  durationMs: z.number().int().min(0).max(1000 * 60 * 60).default(0),
  blocksCleared: z.number().int().min(0).max(500).default(0)
});

export type MatchResultInput = z.infer<typeof matchResultSchema>;
