import { z } from "zod";
import { CAMPAIGN_STAGE_IDS } from "@/game/simulation/campaign";

export const matchWinnerSchema = z.enum(["player", "bot", "bot-a", "bot-b", "draw"]);

export const campaignStageIdSchema = z.enum(CAMPAIGN_STAGE_IDS);

export const matchResultSchema = z.object({
  visitorId: z.string().uuid(),
  mode: z.enum(["player-vs-bot", "bot-skirmish", "campaign"]).default("player-vs-bot"),
  winner: matchWinnerSchema.default("draw"),
  durationMs: z.number().int().min(0).max(1000 * 60 * 60).default(0),
  blocksCleared: z.number().int().min(0).max(500).default(0),
  stageId: campaignStageIdSchema.optional()
}).superRefine((match, context) => {
  if (
    (match.mode === "player-vs-bot" || match.mode === "campaign") &&
    (match.winner === "bot-a" || match.winner === "bot-b")
  ) {
    context.addIssue({
      code: "custom",
      message: "Player matches must use player, bot, or draw winners",
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

  if (match.mode === "campaign" && !match.stageId) {
    context.addIssue({
      code: "custom",
      message: "Campaign matches must name a stage",
      path: ["stageId"]
    });
  }

  if (match.mode !== "campaign" && match.stageId) {
    context.addIssue({
      code: "custom",
      message: "Only campaign matches carry a stage",
      path: ["stageId"]
    });
  }
});

export type MatchResultInput = z.infer<typeof matchResultSchema>;
