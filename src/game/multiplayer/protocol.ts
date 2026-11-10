import { z } from "zod";
import type { BotProfileId } from "../simulation/bots";
import type { DuelState, Seat } from "../simulation/duel";
import type { SeriesOutcome } from "../simulation/series";

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), ticket: z.string().min(1).max(4096) }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("input"), roundId: z.string().max(80), sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    command: z.discriminatedUnion("type", [
      z.object({ type: z.literal("move"), direction: z.enum(["up", "down", "left", "right"]) }).strict(),
      z.object({ type: z.literal("bomb") }).strict(),
      // Remote detonate. Clients send it only while their fighter holds Remote, which a
      // server that predates perks never grants, so an older server never sees it.
      z.object({ type: z.literal("detonate") }).strict()
    ]) }).strict(),
  z.object({ type: z.literal("leave") }).strict()
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
type SnapshotBase = {
  type: "state";
  serverId: string;
  roundId: string;
  seat: Seat;
  phase: "waiting" | "countdown" | "playing" | "finished";
  players: ({ name: string; connected: boolean; ready: boolean } | null)[];
  duel: DuelState | null;
  reconnectSeconds: number | null;
};
/** The friend duel's snapshot is unchanged by Party Brawl: no `mode`, two seats. */
export type DuelSnapshot = SnapshotBase & { mode?: undefined };
/** Who holds each seat in the party lobby now; an empty seat is played by its bot. */
export type PartySeatView = { kind: "human"; name: string; connected: boolean; ready: boolean } | { kind: "bot"; profileId: BotProfileId };
/** Who is fighting in the current or last round, in seat order. */
export type PartyFighterView = { kind: "human"; name: string } | { kind: "bot"; profileId: BotProfileId };
export type PartySeriesView = {
  /** Rounds played so far in this series. */
  rounds: number;
  target: number;
  /** Round wins of each seat's current occupant; a newcomer starts at zero. */
  wins: number[];
  outcome: SeriesOutcome | null;
};
export type PartySnapshot = SnapshotBase & {
  mode: "party";
  seats: PartySeatView[];
  fighters: PartyFighterView[] | null;
  series: PartySeriesView | null;
};
export type RoomSnapshot = DuelSnapshot | PartySnapshot;
export type ServerMessage = RoomSnapshot | { type: "error"; message: string; fatal: boolean };
