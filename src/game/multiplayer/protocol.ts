import { z } from "zod";
import type { DuelState, Seat } from "../simulation/duel";

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), ticket: z.string().min(1).max(4096) }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("input"), roundId: z.string().max(80), sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    command: z.discriminatedUnion("type", [
      z.object({ type: z.literal("move"), direction: z.enum(["up", "down", "left", "right"]) }).strict(),
      z.object({ type: z.literal("bomb") }).strict()
    ]) }).strict(),
  z.object({ type: z.literal("leave") }).strict()
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type RoomSnapshot = {
  type: "state";
  serverId: string;
  roundId: string;
  seat: Seat;
  phase: "waiting" | "countdown" | "playing" | "finished";
  players: ({ name: string; connected: boolean; ready: boolean } | null)[];
  duel: DuelState | null;
  reconnectSeconds: number | null;
};
export type ServerMessage = RoomSnapshot | { type: "error"; message: string; fatal: boolean };
