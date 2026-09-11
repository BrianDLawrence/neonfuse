import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";

const ticketSchema = z.object({
  playerId: z.string().min(1).max(100), name: z.string().min(1).max(100),
  roomId: z.string().min(1).max(256), expiresAt: z.number().int(), nonce: z.string().uuid()
}).strict();
export type JoinTicket = z.infer<typeof ticketSchema>;

function signature(payload: string, secret: string) {
  if (secret.length < 32) throw new Error("MULTIPLAYER_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(payload).digest();
}
export function signJoinTicket(identity: Pick<JoinTicket, "playerId" | "name" | "roomId">, secret: string, now: number) {
  const payload = Buffer.from(JSON.stringify({ ...identity, expiresAt: now + 30000, nonce: randomUUID() })).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}
export function verifyJoinTicket(ticket: string, secret: string, now: number): JoinTicket | null {
  try {
    if (ticket.length > 4096) return null;
    const parts = ticket.split(".");
    if (parts.length !== 2) return null;
    const expected = signature(parts[0], secret);
    const actual = Buffer.from(parts[1], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const parsed = ticketSchema.safeParse(JSON.parse(Buffer.from(parts[0], "base64url").toString()));
    if (!parsed.success || parsed.data.expiresAt <= now || parsed.data.expiresAt > now + 30000) return null;
    return parsed.data;
  } catch { return null; }
}
