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
NEXT_PUBLIC_DISCORD_CLIENT_ID=
```

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Keep it and the
Discord client secret server-side. Neither value may use a `NEXT_PUBLIC_` prefix.
The Discord Client ID is public, so the same value is intentionally supplied as
`NEXT_PUBLIC_DISCORD_CLIENT_ID` for the Embedded App SDK.

## Runtime behavior

- Better Auth owns its `user`, `session`, `account`, and verification collections.
- `/api/auth/*` is disabled with a 503 response when configuration is incomplete.
- Match, visitor, and high-score writes require an authenticated web or Activity session.
- Web OAuth and Activity auth derive the same stable player ID from Discord's verified user ID.
- Public leaderboard reads remain available without authentication.
- `/api/health` reports `authentication` as `configured` or `not-configured`.

The game still keeps its local visitor UUID for compatibility with existing
leaderboard records, but that UUID is not accepted as proof of identity.

See [Discord Activity setup](DISCORD_ACTIVITY.md) for embedded launch configuration.
