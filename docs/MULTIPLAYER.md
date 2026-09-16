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
  tweens. It never decides the outcome of multiplayer commands.

The server advances the simulation and broadcasts snapshots every 50 ms. Clients
send sequenced commands tagged with the current round ID. The server ignores old
rounds and duplicate commands. Bombs use a 1.4-second fuse for both human players.
Blasts apply damage at detonation; their fading visuals are cosmetic afterward.

The existing scene still orchestrates local rounds. Moving those modes onto the
new state machine is a separate migration, so their established timing and bot
behavior do not change as part of multiplayer.

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
- A second live connection for the same account is rejected. A disconnected
  account can reclaim its seat during the grace period.
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
- Failed writes retry while the process is alive. A hard process failure during
  a database outage can lose pending results; this is an unranked friend mode.
- Empty rooms expire. Inputs are limited to 40 messages/second per connection;
  payloads are bounded to 8 KiB, unauthenticated connections time out, and slow
  clients are disconnected. Add platform-level connection/request rate limiting
  before broad public discovery.

## Verification

`npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` cover
both app and server. Tests exercise simulation, room isolation, readiness,
reconnect/forfeit, rematches, membership verification, ticket tampering/replay,
and two real WebSocket clients receiving the same countdown.

Before release, use two Discord accounts/devices in the same Activity to verify
admission, mobile controls, shared movement/blasts/results, and reconnection.
