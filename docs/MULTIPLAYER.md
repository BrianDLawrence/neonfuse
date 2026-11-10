# Two-player Discord matches

Neon Fuse now has a **Play with a friend** mode. Two authenticated users in the
same Discord Activity share a lobby, select Ready, play a three-minute duel, and
can request a mutual rematch. Local Match and Bot Skirmish retain their existing
simulation and presentation paths.

## Architecture

- `src/game/simulation/duel.ts`: pure authoritative state, movement cooldowns,
  bombs, chain reactions, powerups, deaths, draws, and round timeout. Reuses the
  existing arena, blast, and loadout helpers. Commands cannot supply coordinates,
  timing, loadouts, or outcomes.
- `server/rooms.ts`: two seats per Activity instance, ready votes, countdown,
  round IDs, ordered inputs, reconnect grace, and result generation.
- `server/realtime.ts`: WebSocket transport, signed admission tickets, payload
  validation, replay protection, command limits, heartbeats, and backpressure.
- `server/index.ts`: standalone Node process and server-only MongoDB results.
- `src/components/game/DuelGame.tsx`: React lobby, status, results, and controls.
- `src/game/scenes/DuelScene.ts`: Phaser input and rendering with short movement
  tweens. It shares the canonical board fit and explosion renderer with local
  modes, and never decides the outcome of multiplayer commands.

The server advances the simulation and broadcasts snapshots every 50 ms. Clients
send sequenced commands tagged with the current round ID. The server ignores old
rounds and duplicate commands. Bombs use a 1.4-second fuse for both human players.
Blasts apply damage at detonation; their fading visuals are cosmetic afterward.

The existing scene still orchestrates local rounds. Moving those modes onto the
new state machine is a separate migration, so their established timing and bot
behavior do not change as part of multiplayer.

## Party Brawl

Party Brawl is a second lobby in the same Activity instance, kept apart from the
duel: its room key is `<instanceId>#party`, and the ticket route signs
`mode: "party"` into the ticket when the client posts `{ "mode": "party" }`.
Duel tickets, rooms, snapshots and results are unchanged.

Players open it from **Start Party Brawl** in the Discord Party dialog or
**Party Brawl** in the menu. The lobby shows four seats (bots in any empty one),
each seat's series fuse, and **Ready**, **Next round** or **Rematch**. A fighter
who is out watches the rest of the round. `DuelGame` renders both modes; the
party screens live in `src/components/game/PartyBrawl.tsx`.

- Four fighters always. People take the lowest free seat; at each round start
  the server fills every empty seat with a bot (`src/game/simulation/partyBots.ts`).
  A seat's bot is fixed: Circuit Shade, Fuse Rush, Volt Warden, Glitch Bloom.
- Bots reuse the local bot brain but act only through `commandDuel`, so they
  have the same move cooldown, bomb cap and 1.4 s fuse as people. Decisions are
  seeded from the round ID and run on duel time, never `Math.random`.
- A round needs two people seated and ready; a round against bots alone never
  starts, so it is never stored.
- A forfeit (leaving, or reconnect grace running out) knocks out only that
  fighter. The round runs on, bots included, until one fighter is left or time
  runs out. If no person is left in the room the round is abandoned and not
  stored.
- Best of three (`src/game/simulation/series.ts`): first to two round wins,
  capped at five rounds, after which the leader wins and a tie is a draw. Every
  seated person votes for the next round. Between rounds a newcomer may take a
  bot's seat or a free one; round wins belong to whoever holds the seat, so a
  newcomer starts at zero and a person who leaves loses their wins.
- Results: each round is a `duel_results` document with `mode: "party"`,
  `players` (people only), `seats`, `outcome` (`human`, `bot` or `draw`) and
  `winnerId` (a person, or null). Each finished series is one `party_series`
  document, unique by `seriesId`. Both are built by the server and checked
  against `src/lib/schemas/party-result.ts` before writing. Career, history and
  roster readers keep party rounds out of duel records, so a bot win never reads
  as a duel draw; Party Brawl has its own profile tally and XP.

Deploy the realtime server before the Next.js app: an older realtime server
rejects tickets that carry `mode`, which only affects Party Brawl.

## Perks

Each round's `DuelState` carries `rules` from `roundRules(mode)` in
`server/rooms.ts`, which reads the per-mode table in
`src/game/simulation/perks.ts`. The friend duel drops only Vision; Party Brawl
also drops Shield and Kick. Shield and Kick are part of the authoritative
simulation: `advanceDuel` applies `resolveShieldHit` to each tick's hits, a
move into a bomb with Kick starts a slide in `commandDuel` (no new command),
and `advanceDuel` steps slides on the server clock before resolving blasts.
Vision is presentation only, so the server just carries the loadout field.

Blast zones are hidden unless your fighter holds Vision. A snapshot with no
`rules` comes from a server that predates perks, so the client keeps the
classic always-on overlay for it. Deploy the Next.js app before the realtime
server for perk changes: a new client copes with an old server, but an old
client against a new server would draw perk pickups without their art.

## Configuration

Use Node 22.13+ (or a supported newer LTS). Install dependencies with `npm ci`.

Next.js server environment:

```text
MULTIPLAYER_SECRET=<random secret containing at least 32 characters>
DISCORD_BOT_TOKEN=<bot token for the existing Discord application>
DISCORD_CLIENT_ID=<existing application id>
```

Keep all three server-side. The bot token verifies the authenticated user's
membership using Discord's Activity Instance API. The client-supplied instance ID
alone does not authorize joining a room.

Realtime server environment:

```text
MULTIPLAYER_SECRET=<same secret as Next.js>
MONGODB_URI=<server-only connection string>
MONGODB_DB=neon-fuse
PORT=3001
MAX_REALTIME_CONNECTIONS=200
MAX_REALTIME_ROOMS=100
```

`MONGODB_URI` is optional for this unranked mode. Without it, matches still run,
but completed duel results are not written to MongoDB.

Next.js uses the existing Activity bearer session to issue a signed, single-use
30-second join ticket. The ticket travels in the first WebSocket message, never
in a URL. A reconnect obtains a fresh ticket and verifies membership again.

For local browser testing, set the public endpoint before starting Next.js:

```text
NEXT_PUBLIC_MULTIPLAYER_URL=ws://localhost:3001/multiplayer
```

This URL is public configuration, not a credential. Normal web login alone does
not authorize friend matches; actual admission requires a Discord Activity
session. Browser automation tests can intercept ticket requests using synthetic
identities and an isolated test server; there is no production auth bypass.

## Run and deploy

```bash
npm run dev
npm run dev:server
```

Run the commands in separate terminals. `dev:server` compiles the server and loads
`.env.local` if present. Rebuild/restart it after server changes.

For production:

```bash
npm run build
npm run start:server
```

Keep Next.js on its existing deployment. Deploy the compiled realtime process to
a host that runs a persistent Node service, terminates TLS, and supports WebSocket
upgrades. Configure an HTTP health check at `/health`.

The repository includes a Render Blueprint for the initial single-instance host.
Create a Blueprint from the repository's `render.yaml`, enter the same
`MULTIPLAYER_SECRET` used by Next.js when prompted, and keep the Free plan for a
hobby deployment. Render builds only the realtime server, starts it on the
platform-provided port, and checks `/health`. Free instances can take about a
minute to wake after 15 minutes without inbound traffic; the client reconnects
automatically while the instance starts. Use an always-on plan if that delay is
not acceptable.

**Run one realtime process/replica for this version.** Rooms and nonce replay
protection live in that process. Do not enable horizontal scaling without shared
room routing and replay storage. Deployments or process failures abandon active
rounds; reconnecting clients explain that they must ready up again.

The process rejects connections beyond its configured ceiling with a retryable
HTTP `503`. Graceful shutdown sends WebSocket restart code `1012`, allowing the
existing client reconnect flow to take over. `/health` exposes only aggregate
capacity and persistence state; it returns `503` when configured persistence is
unavailable or the process is draining.

In the Discord Developer Portal, add an Activity URL mapping:

```text
/multiplayer -> <realtime-hostname>
```

Keep the existing `/` mapping to Next.js. The Activity connects through
`wss://<application-id>.discordsays.com/multiplayer`. The realtime server accepts
both `/` (when the proxy strips the prefix) and `/multiplayer`. Verify the mapping
from inside Discord with two accounts after deployment.

For direct browser testing, set the Vercel Production variable
`NEXT_PUBLIC_MULTIPLAYER_URL` to `wss://<realtime-hostname>/multiplayer` and
redeploy the Next.js project. This public value contains no credential.

References:
- [Discord multiplayer and membership verification](https://docs.discord.com/developers/activities/development-guides/multiplayer-experience)
- [Discord networking and URL mappings](https://docs.discord.com/developers/activities/development-guides/networking)

## Lifecycle and persistence

- One lobby per Activity instance, two distinct accounts, no spectators or queue.
- A newer connection for the same account takes over its seat, even while the
  old socket still looks live (a mobile network switch or Activity reload can
  reconnect before the heartbeat notices). The fresh ticket is single-use and
  membership-verified, so the match continues without a forfeit. The server
  closes the old socket with code 4009 and ignores anything it still sends. The
  replaced client does not reconnect on its own, so two open windows cannot keep
  taking the seat from each other; Retry reclaims it. A disconnected account can
  reclaim its seat during the grace period.
- Both players must be connected, have loaded their arena, and select Ready.
- A disconnect during countdown cancels it and clears both ready votes.
- During play, the round continues while a player reconnects. The server reserves
  their seat for 15 seconds after detecting the disconnected socket. Missing
  heartbeat responses can take up to 10 seconds to detect.
- Leaving during play forfeits immediately. Expired reconnect grace forfeits to
  a connected opponent; if neither is connected the result is a draw.
- Rematch requires two fresh votes and creates a new round ID. Local reset cannot
  reset a shared match.
- The match server alone writes `duel_results`, with a unique index on `roundId`.
  These results are separate from client-submitted local scores and leaderboards.
- Player profiles derive verified duel totals and streaks from these unique
  result documents; the browser cannot submit or increment career statistics.
- The Activity party panel uses the same verified instance-membership check as
  duel admission before returning safe social profile cards.
- Failed writes retry while the process is alive. A hard process failure during
  a database outage can lose pending results; this is an unranked friend mode.
- Empty rooms expire. Inputs are limited to 40 messages/second per connection;
  payloads are bounded to 8 KiB, unauthenticated connections time out, and slow
  clients are disconnected. HTTP ticket issuance and party discovery also use
  shared MongoDB-backed rate limits with a per-instance fallback. Platform-level
  connection limiting remains a hosting-layer defense for volumetric attacks.

## Verification

`npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` cover
both app and server. Tests exercise simulation, room isolation, readiness,
reconnect/forfeit, seat takeover by a newer connection, rematches, membership verification, ticket tampering/replay,
and two real WebSocket clients receiving the same countdown.

Before release, use two Discord accounts/devices in the same Activity to verify
the party roster, native invite behavior, admission, mobile controls, shared
movement/blasts/results, and reconnection.

See [Production operations](OPERATIONS.md) for the scheduled two-service health
probe, sanitized error event catalog, capacity thresholds, and horizontal-scaling
requirements.
