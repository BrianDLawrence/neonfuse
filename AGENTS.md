# AGENTS.md

## Project Priorities

Neon Fuse is a browser-based Phaser + Next.js bomber game. Prioritize:

- Testable gameplay simulation logic
- Understandable boundaries between React, Phaser, simulation, API, and persistence
- Secure handling of environment variables, MongoDB, and future OpenAI API calls
- Small, reviewable changes

## Architecture Rules

- Keep gameplay rules in `src/game/simulation`.
- Keep Phaser scenes thin: rendering, input plumbing, camera movement, and visual effects.
- Keep React responsible for DOM UI, HUD, menus, match setup, results, and settings.
- Keep MongoDB access server-side only.
- Do not put secrets in client code.
- Do not expose `MONGODB_URI`, `OPENAI_API_KEY`, or other private env vars to the browser.
- API routes must validate request bodies before writing to MongoDB.
- LLM output that affects gameplay must be structured, validated, and mapped to known rule IDs or bounded numeric values.

## Testing Rules

- Add or update unit tests when simulation rules change.
- Prefer pure functions in `src/game/simulation` for rules that need tests.
- Do not make tests depend on Phaser rendering unless the test is explicitly a browser/playtest.

## Required Checks

Run these after code changes:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Security Rules

- Never commit `.env` or secret values.
- Do not log secrets.
- Validate all API inputs.
- Treat client-submitted match results as untrusted.
- Avoid new dependencies unless they solve a clear problem.
- OpenAI API calls must happen server-side only.

## Git Rules

- Work on a branch for non-trivial changes.
- Keep commits scoped and reviewable.
- Do not revert user changes unless explicitly asked.
