import { z } from "zod";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion";

export const accountDeletionSchema = z.object({
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION)
}).strict();
