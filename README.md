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
```

The health endpoint is available at `/api/health`.

## Architecture Notes

Game rules should live under `src/game/simulation`. Phaser scenes should translate
simulation state into sprites, camera movement, particles, and effects.

React owns text-heavy UI. Phaser owns the playfield.

## License

MIT License. Copyright (c) 2026 Spero Autem LLC.
