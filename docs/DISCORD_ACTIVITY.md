# Discord Activity setup

Neon Fuse runs from the same Vercel deployment as a normal website and as an
embedded Discord Activity. The Activity uses Discord's Embedded App SDK for
authorization and a short-lived bearer session for game API calls. It does not
depend on third-party cookies inside Discord's iframe.

## What is implemented

1. The client detects Discord's Activity proxy and initializes the Embedded App SDK.
2. Discord returns a one-time authorization code for the `identify` scope.
3. `/api/activity/session` exchanges that code with Discord on the server and verifies the user through `/users/@me`.
4. The server stores only a SHA-256 hash of the opaque Neon Fuse session token. MongoDB expires it after at most one hour.
5. Web OAuth and Activity login derive the same internal player ID from the verified Discord user ID.
6. The HUD party link displays the current Activity participant count and opens
   a private roster with safe profile cards for connected fighters.
7. The party panel can open Discord's native invite dialog where the current
   Discord context permits invitations.
8. **Play with a friend** opens a two-player lobby with server-authoritative matches.
   See [multiplayer setup](MULTIPLAYER.md) for its additional server, credentials,
   and Discord URL mapping.

## Session renewal

The Activity bearer session lasts at most one hour, so the client renews it
before it lapses. Renewal lives in
[`src/lib/activity-session-renewal.ts`](../src/lib/activity-session-renewal.ts)
and is started by `DiscordActivityAuthGate` once the first session is issued.

- `/api/activity/session` returns `expiresIn` (seconds). The client schedules a
  renewal five minutes before that, or halfway through the lifetime for
  sessions shorter than ten minutes.
- A renewal repeats the full sign-in: a silent `sdk.commands.authorize` with
  `prompt: "none"` for a fresh one-time code, then a POST to
  `/api/activity/session`. Discord re-verifies the user each time, so the
  server-side one-hour cap still applies to every token.
- If renewal fails, the client keeps the old token and retries with
  exponential backoff (2s, 4s, 8s, and so on, capped at 60s) until one
  succeeds. Each failure is logged to the console.
- Game code never receives the token as a string. React components get a
  stable `ActivityAuth` object and call `getToken()` while building each
  request, so a renewal re-renders nothing and re-runs no effects. This matters
  most for friend matches: the duel socket's effect cleanup sends `leave`,
  which the server treats as a forfeit.
- Multiplayer ticket requests and match-result saves treat a `401` as "renew
  now, then retry once" (`fetchWithActivityRenewal`). They report an error only
  if the retry also fails. When the realtime server closes a socket at its
  one-hour limit, the client reconnects without sending `leave` and asks for
  a new ticket with the renewed token.

## Vercel environment

Add this public value in addition to the existing authentication variables:

```text
NEXT_PUBLIC_DISCORD_CLIENT_ID=<same value as DISCORD_CLIENT_ID>
```

`NEXT_PUBLIC_` means the Client ID is embedded in browser JavaScript. Discord
Client IDs are public. Never expose `DISCORD_CLIENT_SECRET`, `BETTER_AUTH_SECRET`,
or `MONGODB_URI` this way.

Redeploy after adding the variable. `/api/health` should report
`discordActivity` as `configured`.

## Discord Developer Portal

Use the same Discord application already configured for web OAuth:

1. Under **Installation**, enable User Install and Guild Install if launches should work in servers, DMs, and group DMs.
2. Under **OAuth2 → Redirects**, keep the Better Auth callback URLs and add `https://127.0.0.1` for the Activity SDK redirect.
3. Under **Activities → URL Mappings**, map `/` to the production Vercel hostname without `https://` or a path, for example `neon-fuse.vercel.app`.
4. Under **Activities → Settings**, enable Activities. Discord creates the default Launch entry-point command.
5. Enable Developer Mode in Discord while the application is private or in development.
6. Launch Neon Fuse from Discord's App Launcher in a test server, DM, or group DM.

The root mapping covers the page, `/_next` assets, and same-origin `/api`
requests through Discord's proxy.

## Local Activity testing

Discord must reach the local Next.js server through HTTPS. Run Neon Fuse locally,
expose port 3000 with a trusted tunnel such as Cloudflare Tunnel or ngrok, then
temporarily point the `/` Activity mapping at the tunnel hostname. Restore the
production Vercel hostname after testing.

A normal browser does not initialize the Embedded App SDK and continues to use
the Better Auth web flow. Activity behavior must be tested from inside Discord.

## Security and operational notes

- SDK-provided client identity is never accepted as proof of identity.
- Discord OAuth codes are exchanged only on the server with the Client Secret.
- Activity bearer tokens are random, held only in client memory, stored hashed in MongoDB, and expire after at most one hour. Renewal issues a new token only after Discord re-authorizes the user. The previous token keeps working until its own expiry.
- MongoDB TTL cleanup is asynchronous; authorization also checks `expiresAt`, so an expired token stops working before cleanup.
- `instanceId` and participant data are context, not authorization. Future multiplayer APIs must validate every player action server-side.
- `/api/social/party` revalidates instance membership with the Discord bot before
  returning profile cards and never accepts client-supplied member IDs.
- Party cards omit Discord IDs and private Neon Fuse player IDs.
- Activity session exchange, party lookup, multiplayer tickets, authentication,
  and game-data writes use layered fixed-window rate limits. A per-instance
  guard remains active during MongoDB outages, while MongoDB-backed counters
  provide shared enforcement across serverless instances. Client addresses are
  HMAC-hashed before storage and expired buckets are removed by TTL.
