---
name: sim-rule
description: Scaffold a new pure, deterministic, test-first game rule in src/game/simulation following the Neon Fuse house style. Use when adding gameplay logic (blast/danger/powerup/bot/arena-style rules) that must be testable without Phaser. Takes the rule name as an argument, e.g. "/sim-rule chain-reaction".
---

# /sim-rule — scaffold a pure simulation rule (TDD)

Create a new gameplay rule in [src/game/simulation/](../../../src/game/simulation/) that obeys the core boundary rule from [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md): **gameplay rules take plain data and return data or an intent — never Phaser/React objects.**

## Inputs

- The rule name from `$ARGUMENTS` (kebab-case file name, e.g. `chain-reaction`). If absent, ask what the rule does and pick a name.
- Briefly confirm with the user: what inputs the rule reads (arena grid? actor state? bombs?) and what it returns (a value, a list of tiles, or an intent union).

## House style — match the existing modules

Read a sibling first (e.g. [blast.ts](../../../src/game/simulation/blast.ts), [danger.ts](../../../src/game/simulation/danger.ts), [bots.ts](../../../src/game/simulation/bots.ts)) and mirror its shape. Non-negotiables:

- **Pure & deterministic.** No I/O, no Phaser/React imports, no `Date.now()`. Same inputs → same output.
- **Seeded randomness only.** If the rule needs variation, take a numeric `seed`/`decisionSeed` parameter and derive jitter from it (see the `seededJitter` helper pattern in [bots.ts](../../../src/game/simulation/bots.ts)). Never `Math.random()`.
- **Reuse existing types**: `ArenaGrid`, `GridPoint` from [arena.ts](../../../src/game/simulation/arena.ts); `BombThreat`, `manhattanDistance`, `getAdjacentTiles` from [danger.ts](../../../src/game/simulation/danger.ts); loadout/powerup types from [powerups.ts](../../../src/game/simulation/powerups.ts). Don't redefine them.
- **Named exports**, double quotes, semicolons, 2-space indent.
- Options-object params for 3+ arguments (destructure in the signature), discriminated unions for intents/state.

## Procedure (write the test first)

1. **Create `src/game/simulation/<name>.test.ts`** with Vitest (`import { describe, expect, it } from "vitest";`). Use a small literal arena helper like the one in [blast.test.ts](../../../src/game/simulation/blast.test.ts). Write cases covering: the happy path, edge of the grid / hard-block boundaries, the empty/no-op case, and — if seeded — determinism (same seed → same result). The tests should fail at first because the function doesn't exist yet.
2. **Create `src/game/simulation/<name>.ts`** implementing the rule with a clear exported function and explicit return type. Add a short doc comment stating inputs/outputs and that it's pure.
3. **Iterate** until tests pass.
4. Run **`/check`** (or at minimum `npm run typecheck && npm run test`) before declaring done.

## Wiring

Do **not** call the new rule from a Phaser scene as part of this skill unless asked — keep the change reviewable. If the user wants it wired in, the scene should adapt the rule's returned data/intent into sprites/tweens; the rule stays unaware of the engine.
