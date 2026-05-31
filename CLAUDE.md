# CLAUDE.md

Guidance for Claude Code when working in this repository.

**Neon Fuse** is a browser-based 2D bomber game built on Next.js + Phaser + MongoDB.

## Canonical docs (read these first)

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layer boundaries, data flow, state ownership, AI/security boundaries. **This is the source of truth for *where code goes*.**
- [AGENTS.md](AGENTS.md) — agent working rules (also used by Codex). The rules below mirror it; if the two ever disagree, AGENTS.md and ARCHITECTURE.md win.
- [README.md](README.md) — stack summary and local setup.

## Commands

```bash
npm run dev          # local dev server at http://localhost:3000
npm run lint         # eslint
npm run typecheck    # tsc --noEmit (strict)
npm run test         # vitest run (one-shot)
npm run test:watch   # vitest watch
npm run build        # next build
```

**Required after any code change** (this is what CI runs — see [.github/workflows/ci.yml](.github/workflows/ci.yml)):

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

## Architecture in one screen

Layers, from rules outward to presentation. Keep dependencies pointing *inward* — simulation must not import React or Phaser.

| Layer | Path | Owns | Must NOT |
| --- | --- | --- | --- |
| Simulation | [src/game/simulation/](src/game/simulation/) | Pure game rules: arena, walkability, blast, danger, bots, powerups, win conditions | import Phaser/React; do I/O; be non-deterministic |
| Phaser scenes | [src/game/scenes/](src/game/scenes/) | Rendering, sprites, tweens, camera, input plumbing, effects | hold gameplay rules; call OpenAI/Mongo |
| Phaser boot | [src/game/createGame.ts](src/game/createGame.ts) | The boot boundary + the React↔Phaser event contract (`GameEvents`) | — |
| React UI | [src/components/](src/components/) | HUD, menus, match setup, results, settings, bot roster | run gameplay simulation |
| Routes/API | [src/app/](src/app/) | Next routes + API endpoints; validate input, server-side work | trust client payloads; leak secrets |
| Infra/shared | [src/lib/](src/lib/) | MongoDB helpers, Zod request schemas | run client-side Mongo access |

**Frontend/UI work — required:** before writing **or planning** any change to visible UI (React components, the HUD overlay, menus, dialogs, match setup/results, settings, the bot roster, or `globals.css`), invoke **both** design skills and follow them. This applies in plan mode too — fold their design pass into the plan.

- **`/frontend-design:frontend-design`** (official plugin) — general design taste: typography, color, composition, motion.
- **`/neon-fuse-ui`** (this repo) — the project-specific system: the `:root` tokens, class conventions, HUD-over-canvas `pointer-events`/z-index layering, the ≤760px breakpoint, and the a11y patterns the app already uses. On conflict, the repo rules here win (e.g. no Tailwind, use existing tokens).

If the `/frontend-design:frontend-design` plugin isn't installed, install it once with `/plugin install frontend-design@claude-plugins-official` then `/reload-plugins`; `/neon-fuse-ui` works on its own in the meantime.

**Core boundary rule:** gameplay rules take plain data, never engine objects.

```ts
calculateBlast(arena, origin, range);        // good — testable
calculateBlast(scene, sprite, camera, tweens); // avoid — couples rules to Phaser
```

The React↔Phaser bridge is intentional and narrow: React passes data/callbacks via `createGame({ events })`, and Phaser reads them through `game.registry` and emitted events (see [PhaserGame.tsx](src/components/game/PhaserGame.tsx) ↔ [createGame.ts](src/game/createGame.ts)). Add new cross-boundary data to the `GameEvents` type, don't reach across it ad hoc.

## Code conventions (as observed in the codebase)

- **TypeScript strict**, `noEmit`. No `allowJs`. Fix types rather than casting to `any`.
- **Named exports**, no default exports.
- **Double quotes**, semicolons, 2-space indent. Match the surrounding file.
- Import via the **`@/*` alias** (`@/game/simulation/bots`), not long relative paths.
- Simulation code is **pure and deterministic**: functions take an `ArenaGrid` / state object and return new data or an intent (e.g. `BotTurnIntent` = `wait | move | plant-bomb`). Randomness is **seeded** (`decisionSeed`), never `Math.random()`, so behavior is reproducible and testable.
- Discriminated unions for state/intents; bounded numeric traits (0–10) for bot tuning.
- API routes parse the body, `safeParse` with a Zod schema from [src/lib/schemas/](src/lib/schemas/), and return `{ ok: false, error }` with a 4xx on failure before touching Mongo.

## Testing

- Unit tests live next to the code as `*.test.ts` and run under **Vitest** (e.g. [blast.test.ts](src/game/simulation/blast.test.ts)).
- Tests cover **pure simulation behavior only** — arena creation, walkability, blast propagation, block destruction, bot decisions, win/loss, schema validation. They must not depend on Phaser rendering.
- **Add or update tests whenever a simulation rule changes.** If a rule needs a test, it belongs in `src/game/simulation` as a pure function.

## Security & AI boundaries (do not violate)

- MongoDB access is **server-only**. Never expose `MONGODB_URI` / `MONGODB_DB` to client code.
- Never commit `.env` or log secrets. `.env` is gitignored; use `.env.example` as the template.
- **All API inputs are untrusted**, including client-submitted match results — validate with Zod before writing.
- OpenAI/LLM calls (future) must be **server-side only**, never from Phaser scenes or React client components.
- LLM output that affects gameplay must be **structured JSON, validated, and mapped to known rule IDs or bounded numeric ranges**. LLM output may patch persona/flavor/metadata; it must never emit live game logic or mutate simulation state directly.

## Git

- Branch for non-trivial work; keep commits scoped and reviewable.
- Don't revert user changes unless asked.
- Run the required checks above before considering a change done.
