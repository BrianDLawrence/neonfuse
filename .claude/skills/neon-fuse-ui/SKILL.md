---
name: neon-fuse-ui
description: Apply THIS repo's specific UI system — the Neon Fuse design tokens, class conventions, HUD-over-canvas layering, responsive breakpoint, and accessibility patterns — when creating or changing any UI (React components, HUD, menus, dialogs, match setup/results, settings, bot roster, or globals.css). Invoke BEFORE writing UI code AND when planning new UI configuration. Pair it with the official `frontend-design` plugin skill, which supplies general design taste; this skill supplies the project-specific constraints that a generic skill cannot know.
---

# /neon-fuse-ui — this repo's UI system

Use this whenever you add or change visible UI, or when planning new UI configuration. The goal: every new screen, panel, chip, or control looks and behaves like it was always part of the app.

**Division of labor:** for general design judgment — typography, color theory, composition, motion, "make it not look generic" — use the official **`/frontend-design:frontend-design`** plugin skill. *This* skill is the project-specific layer: the exact tokens, class conventions, HUD constraints, and a11y patterns Neon Fuse already uses. When they seem to conflict, this skill's concrete repo rules win (e.g. no Tailwind, use the existing tokens).

Read the current source of truth before changing it — [globals.css](../../../src/app/globals.css) (the whole design system) and [GameShell.tsx](../../../src/components/game/GameShell.tsx) (the canonical component patterns).

## When planning UI (do this first)

Before writing code for a new panel/control/screen, produce a short design pass:

1. **Tokens** — which CSS variables it uses (never new hardcoded colors).
2. **Reuse** — which existing classes/components it can reuse (`hud-chip`, `command-button`, `admin-dialog`, `bot-roster-button`, `trait-pill`, `key-chip`, …) before inventing new ones.
3. **New classes** — only what's genuinely new, named in the existing flat semantic style.
4. **Responsive + a11y plan** — how it behaves at ≤760px and which ARIA pattern it follows.

Keep it to a few lines. Then build.

## Visual language

Neon arcade over a near-black layered field. Color = meaning, glow = emphasis.

- **Use the design tokens in `:root`, never raw hex.** Palette: `--cyan` (primary/active/info), `--pink` (secondary/opponent), `--green` (positive/selected), `--amber` (energy/speed), `--danger`. Surfaces: `--background`, `--background-deep`, `--panel`, `--panel-strong`. Text: `--text`, `--muted`. Lines: `--line`, `--line-strong`. If a genuinely new semantic color is needed, add a token to `:root` first, then reference it.
- **Glow, don't flatten.** Emphasis comes from colored `box-shadow` / `text-shadow` / `drop-shadow` in low-opacity rgba of a palette color, often paired with an `inset` glow on panels. Match the existing intensity — subtle, not blinding.
- **Surfaces:** translucent panels (`--panel` / `--panel-strong`) with a 1px `--line` border and **8px border-radius** (the app standard; pills use `999px`).
- **Type:** Inter. Labels are `text-transform: uppercase`, heavy (`font-weight: 800–900`), with `letter-spacing` ~0.08–0.12em; values use `--text`, captions use `--muted`.
- **Spacing/sizing:** use `clamp()` for fluid sizes that scale with viewport (see `.hud-top`, `.brand-lockup h1`), matching the existing min/preferred/max pattern.

## Structure & styling rules

- **Styles live in [globals.css](../../../src/app/globals.css)** as global, flat, semantic class names (`.bot-roster-button`, `.slider-row`). This project uses **no Tailwind, no CSS modules, no styled-components.** Don't introduce them. Inline `style={}` is only for genuinely dynamic values (e.g. a computed accent color), not static styling.
- **Match naming conventions** — kebab-case, component-or-region prefixed (`bot-*`, `hud-*`, `admin-*`). State via attribute selectors like `[aria-pressed="true"]`, not extra state classes.
- **HUD floats over the Phaser canvas.** The `.hud` overlay is `pointer-events: none`; **any interactive child must set `pointer-events: auto`** (see `.match-actions`, `.admin-dialog-backdrop`). Respect the z-index layers: HUD content `z-index: 10`, modal backdrops `z-index: 20`. New floating UI fits this stack.
- **React owns UI only.** Keep gameplay logic out of components (see [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)). UI reads simulation *data*; it does not run the simulation. New data crossing the React↔Phaser boundary goes through the `GameEvents` contract in [createGame.ts](../../../src/game/createGame.ts), not ad hoc globals.

## Responsive

- Design desktop-first but verify the **≤760px breakpoint** — there's a single `@media (max-width: 760px)` block. New multi-column layouts should collapse to one column there (see `.bot-lab-grid`), and purely decorative/secondary UI may hide on mobile (as `.control-strip` and `.brand-lockup p` do).

## Accessibility (required, not optional — the app already does this)

- **Dialogs:** `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the title, a backdrop click-to-close, and **Escape-to-close** (the `keydown` listener pattern in [GameShell.tsx](../../../src/components/game/GameShell.tsx)). Wire new dialogs into that same handler.
- **Toggles/segmented controls:** reflect state with `aria-pressed` and style via `[aria-pressed="true"]`.
- **Decorative icons** (the CSS `stat-icon`s, SVG `BotProfileIcon`): `aria-hidden="true"`.
- **Dynamic content** that updates in place: `aria-live="polite"` (see `.bot-detail-panel`).
- **Inputs** get an associated `<label>`; interactive elements have visible `:focus-visible` styling.
- Use semantic elements (`button`, `label`, `section`, `aside`, headings) — not clickable `div`s.

## Constraints

- **Avoid new dependencies** for UI (no component/icon/animation libraries) — per [AGENTS.md](../../../AGENTS.md), build from the existing tokens and patterns unless the user approves a dependency.
- Keep changes small and reviewable; extend the system, don't fork its style.

## After a UI change

CSS/layout regressions don't show up in unit tests, so:

1. Run **`/check`** (lint · typecheck · test · build).
2. **Look at it** — use `/run` (or the `/verify` skill) to launch the app and confirm the change renders correctly at desktop and ≤760px width before calling it done.
