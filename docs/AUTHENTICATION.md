# Discord Authentication

Neon Fuse uses Better Auth with Discord OAuth and the existing MongoDB database.
The browser receives an HTTP-only session cookie; API routes resolve that cookie
server-side before accepting player-owned writes.

## Discord application

Create a Discord developer application named `Neon Fuse`, then add this OAuth2
redirect for local development:

```text
http://localhost:3000/api/auth/callback/discord
```

For production, add the same path on the public HTTPS origin. Discord must have
every environment's exact callback URL registered.

## Environment variables

Copy `.env.example` to `.env.local` and provide:

```text
MONGODB_URI=
MONGODB_DB=neon-fuse
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Keep it and the
Discord client secret server-side. Neither value may use a `NEXT_PUBLIC_` prefix.

## Runtime behavior

- Better Auth owns its `user`, `session`, `account`, and verification collections.
- `/api/auth/*` is disabled with a 503 response when configuration is incomplete.
- Match, visitor, and high-score writes require an authenticated server session.
- Match and high-score documents receive the Better Auth user ID as `accountId`.
- Public leaderboard reads remain available without authentication.
- `/api/health` reports `authentication` as `configured` or `not-configured`.

The game still keeps its local visitor UUID for compatibility with existing
leaderboard records, but that UUID is not accepted as proof of identity.
