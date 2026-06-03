import { z } from "zod";

export const visitorRequestSchema = z.object({
  visitorId: z.string().uuid().optional()
});

export type VisitorRequestInput = z.infer<typeof visitorRequestSchema>;
