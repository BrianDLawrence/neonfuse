import { z } from "zod";
// Relative imports: the realtime server compiles this file without the `@/` alias.
import { BOT_PROFILE_ORDER } from "../../game/simulation/bots";
import { SERIES_MAX_ROUNDS } from "../../game/simulation/series";

/**
 * The documents the realtime server stores for Party Brawl. The server builds them,
 * but they are still validated before writing: bots never appear as players, a
 * winner must be one of the people who played, and every number is bounded.
 */
const playerIdSchema = z.string().min(1).max(100);
const botProfileSchema = z.enum(BOT_PROFILE_ORDER as [string, ...string[]]);
const storedSeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human"), playerId: playerIdSchema }).strict(),
  z.object({ kind: z.literal("bot"), profileId: botProfileSchema }).strict()
]);
const seatsSchema = z.array(storedSeatSchema).length(4);
const playersSchema = z.array(playerIdSchema).min(2).max(4);

function humansIn(seats: z.infer<typeof seatsSchema>) {
  return seats.flatMap((seat) => (seat.kind === "human" ? [seat.playerId] : []));
}

function playersMatchSeats(document: { players: string[]; seats: z.infer<typeof seatsSchema> }, context: z.RefinementCtx) {
  const humans = humansIn(document.seats);
  if (new Set(humans).size !== humans.length) {
    context.addIssue({ code: "custom", message: "A person can hold only one seat", path: ["seats"] });
  }
  if (humans.length !== document.players.length || humans.some((id, index) => document.players[index] !== id)) {
    context.addIssue({ code: "custom", message: "Players must be exactly the people in the seats", path: ["players"] });
  }
}

export const partyRoundDocumentSchema = z.object({
  mode: z.literal("party"),
  roundId: z.string().min(1).max(80),
  roomId: z.string().min(1).max(300),
  seriesId: z.string().min(1).max(80),
  seriesRound: z.number().int().min(1).max(SERIES_MAX_ROUNDS),
  players: playersSchema,
  seats: seatsSchema,
  outcome: z.enum(["human", "bot", "draw"]),
  winnerId: playerIdSchema.nullable(),
  winnerSeat: z.number().int().min(0).max(3).nullable(),
  reason: z.enum(["blast", "forfeit", "timeout"]),
  durationMs: z.number().int().min(0).max(200_000)
}).strict().superRefine((document, context) => {
  playersMatchSeats(document, context);
  const winner = document.winnerSeat === null ? null : document.seats[document.winnerSeat];
  const expected = !winner ? "draw" : winner.kind;
  const expectedId = winner?.kind === "human" ? winner.playerId : null;
  if (document.outcome !== expected || document.winnerId !== expectedId) {
    context.addIssue({ code: "custom", message: "The winner must match the winning seat", path: ["winnerId"] });
  }
});

export const partySeriesDocumentSchema = z.object({
  seriesId: z.string().min(1).max(80),
  roomId: z.string().min(1).max(300),
  players: playersSchema,
  seats: seatsSchema,
  wins: z.array(z.number().int().min(0).max(SERIES_MAX_ROUNDS)).length(4),
  rounds: z.number().int().min(1).max(SERIES_MAX_ROUNDS),
  winner: storedSeatSchema.nullable(),
  reason: z.enum(["won", "cap"])
}).strict().superRefine((document, context) => {
  playersMatchSeats(document, context);
  if (document.wins.reduce((total, wins) => total + wins, 0) > document.rounds) {
    context.addIssue({ code: "custom", message: "Wins cannot exceed rounds played", path: ["wins"] });
  }
  if (document.winner?.kind === "human" && !document.players.includes(document.winner.playerId)) {
    context.addIssue({ code: "custom", message: "A series winner must be one of its players", path: ["winner"] });
  }
});

export type PartyRoundDocument = z.infer<typeof partyRoundDocumentSchema>;
export type PartySeriesDocument = z.infer<typeof partySeriesDocumentSchema>;
