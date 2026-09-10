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
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
NEXT_PUBLIC_DISCORD_CLIENT_ID=
```

Create the auth secret with `openssl rand -base64 32`. In the Discord developer
portal, authorize `http://localhost:3000/api/auth/callback/discord` as an OAuth2
redirect. Production needs the equivalent callback on its public domain.

The health endpoint is available at `/api/health` and reports whether Discord
authentication is configured.

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
