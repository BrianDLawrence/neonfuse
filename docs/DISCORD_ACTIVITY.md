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
6. The HUD displays the current Activity instance participant count.

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
- Activity bearer tokens are random, held only in client memory, stored hashed in MongoDB, and expire after at most one hour.
- MongoDB TTL cleanup is asynchronous; authorization also checks `expiresAt`, so an expired token stops working before cleanup.
- `instanceId` and participant data are context, not authorization. Future multiplayer APIs must validate every player action server-side.
- Add rate limiting before public discovery or a large external test.
