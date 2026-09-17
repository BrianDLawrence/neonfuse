# Neon Fuse (Bomber Style 2D Game)

A deployable Next.js + Phaser prototype for a neon arcade bomber game.

## Stack

- Next.js App Router for the app shell, API routes, and Vercel deployment
- Phaser 3 for the playable 2D arena
- MongoDB for durable data such as profiles, match history, maps, and leaderboards
- React DOM overlays for HUD, menus, settings, and results

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` and set:

```bash
MONGODB_URI=
MONGODB_DB=neon-fuse
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
RATE_LIMIT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
NEXT_PUBLIC_DISCORD_CLIENT_ID=
MULTIPLAYER_SECRET=
DISCORD_BOT_TOKEN=
NEXT_PUBLIC_MULTIPLAYER_URL=ws://localhost:3001/multiplayer
```

Create the auth secret with `openssl rand -base64 32`. In the Discord developer
portal, authorize `http://localhost:3000/api/auth/callback/discord` as an OAuth2
redirect. Production needs the equivalent callback on its public domain.

The health endpoint is available at `/api/health` and reports whether Discord
authentication is configured.

Public API writes and Discord session/ticket routes use layered fixed-window
rate limits: a fast per-instance guard plus shared MongoDB counters with TTL
cleanup. Client addresses are HMAC-hashed before storage. `RATE_LIMIT_SECRET`
is optional and falls back to `BETTER_AUTH_SECRET`; use a separate high-entropy
value in production when possible.

Friend matches also need the persistent realtime service described in
[`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md). A Render Blueprint is included for
the repository's single-instance WebSocket server.

## Architecture Notes

Game rules should live under `src/game/simulation`. Phaser scenes should translate
simulation state into sprites, camera movement, particles, and effects.

React owns text-heavy UI. Phaser owns the playfield.

- [Capability map](docs/capability-map.html) — interactive view of implemented functionality, planned systems, and current code-review findings.
- [Architecture guide](docs/ARCHITECTURE.md) — ownership boundaries, data flow, testing, security, and AI constraints.
- [Authentication guide](docs/AUTHENTICATION.md) — Discord OAuth setup, environment variables, and server-side session boundaries.
- [Discord Activity guide](docs/DISCORD_ACTIVITY.md) — embedded launch setup, URL mapping, and Activity session security.

## License

MIT License. Copyright (c) 2026 Spero Autem LLC.

## Discord compliance surfaces

Neon Fuse exposes public, unauthenticated routes for Discord review and App
Directory setup:

- `/privacy` — data collection, use, sharing, retention, and deletion policy
- `/terms` — player-facing terms of service
- `/support` — troubleshooting, privacy controls, and support channels

Set `SUPPORT_EMAIL` and `DISCORD_SUPPORT_URL` in the production environment
before submitting the App Directory listing. The support server must be a
Discord Community server.

Signed-in players can permanently remove their account-linked data from
**Fighter Profile → Data Controls**. The deletion endpoint validates the
confirmation phrase server-side and removes profiles, matches, high scores,
visitor records, duel records, Activity sessions, and linked authentication
records. The client also clears Neon Fuse's visitor cookie and local choices.
