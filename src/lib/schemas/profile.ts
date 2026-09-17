import { z } from "zod";
import { PLAYER_TITLE_IDS } from "@/game/simulation/progression";

const botProfileIdSchema = z.enum([
  "fuse-rush",
  "circuit-shade",
  "volt-warden",
  "glitch-bloom"
]);

const botSelectionSchema = z
  .object({
    "bot-a": botProfileIdSchema,
    "bot-b": botProfileIdSchema
  })
  .strict()
  .refine((selection) => selection["bot-a"] !== selection["bot-b"], {
    message: "Bot slots must use different profiles"
  });

export const profilePreferencesPatchSchema = z
  .object({
    musicEnabled: z.boolean().optional(),
    musicVolume: z.number().int().min(0).max(10).optional(),
    sfxVolume: z.number().int().min(0).max(10).optional(),
    selectedTrackId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "Track ID must be a lowercase slug")
      .nullable()
      .optional(),
    botSelection: botSelectionSchema.optional()
  })
  .strict()
  .refine((preferences) => Object.keys(preferences).length > 0, {
    message: "At least one preference is required"
  });

export const playerProfilePatchSchema = z
  .object({
    preferences: profilePreferencesPatchSchema.optional(),
    equippedTitle: z.enum(PLAYER_TITLE_IDS).optional()
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "At least one profile field is required"
  });

export type PlayerProfilePatch = z.infer<typeof playerProfilePatchSchema>;
