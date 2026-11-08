import { z } from "zod";

/** The ticket route's optional body: which lobby of the Activity instance to join. */
export const multiplayerTicketRequestSchema = z.object({
  mode: z.enum(["duel", "party"]).default("duel")
}).strict();

export type MultiplayerTicketRequest = z.infer<typeof multiplayerTicketRequestSchema>;
