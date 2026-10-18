# Single-Player Modes — Design

Status: **design**, campaign first. Nothing here is implemented yet.

Today single player is one mode, `player-vs-bot` ("Local Match"): one round on
the fixed 13×11 board against whichever bot sits in Bot Lab slot A (Fuse Rush by
default). The opponent can already be changed, but only from Bot Lab, so in
practice everyone plays Fuse Rush.

This document designs two modes:

1. **Campaign**: a ladder of stages. Beat Fuse Rush to unlock the next bot. After
   the whole roster, harder challenges follow: tuned bots, new arena layouts,
   two-bot gauntlets, then larger boards with a camera that follows the player.
2. **Versus**: pick any bot from a roster screen and play it. This replaces the
   hidden Bot Lab path for single-player opponent choice.

Campaign is built first. Versus is small once the campaign plumbing exists.

---

## 1. Mode model

`src/game/modes.ts` grows from two modes to three:

```ts
export type GameMode = "player-vs-bot" | "bot-skirmish" | "campaign";
```

- `player-vs-bot` stays as is and becomes **Versus** in the UI. Its opponent is
  still `botSelection["bot-a"]`, so stored profiles and preferences keep working.
- `campaign` is new. A campaign round always carries a `stageId`, and the stage
  definition decides the opponent, arena and modifiers. The player's Bot Lab
  selection is ignored.

The React mode command carries the stage:

```ts
type ModeCommand = { mode: GameMode; stageId?: CampaignStageId; sequence: number };
```

---

## 2. Campaign structure

Three acts. Each act is a short ladder; clearing a stage unlocks the next one.

### Act 1: Circuit Ladder (standard board, 1v1)

The current four bots, ordered so each one teaches something.

| Stage | Opponent | What it teaches |
| --- | --- | --- |
| 1-1 | Fuse Rush | Basics. Aggressive but overcommits, so it is the natural first opponent. |
| 1-2 | Circuit Shade | Tempo. It runs for powerups, so the player learns to contest them. |
| 1-3 | Volt Warden | Space. It traps in soft-block pockets, so the player learns to keep an exit open. |
| 1-4 | Glitch Bloom | Chaos. Its routes are unpredictable, so reading danger tiles matters. |

All four use the default arena and today's timings, so Act 1 needs no new
simulation rules: only the stage data and plumbing.

### Act 2: Overclock (standard size, modified rules)

Rematches with bounded tuning, plus arena layouts and the first two-bot fights.

| Stage | Setup |
| --- | --- |
| 2-1 | Fuse Rush **Overclocked**: starts with 2 bombs, shorter bot fuse |
| 2-2 | Circuit Shade on the **Open Core** layout (cleared centre, dense ring) |
| 2-3 | Volt Warden on the **Maze** layout (high soft-block density) |
| 2-4 | Glitch Bloom Overclocked, powerup drops tilted toward speed |
| 2-5 | **Gauntlet**: Fuse Rush + Circuit Shade at once (player vs two bots) |

### Act 3: Megagrid (large boards, follow camera)

Boards bigger than the screen. The camera follows the player, a minimap shows
the whole grid, and edge arrows point at off-screen bots.

| Stage | Board | Setup |
| --- | --- | --- |
| 3-1 | 19×15 | Volt Warden, standard rules: learn the camera |
| 3-2 | 21×17 | Circuit Shade + Glitch Bloom gauntlet |
| 3-3 | 25×19 | Final: all modifiers, two Overclocked bots |

Board sizes stay odd so the pillar pattern and corner spawns still work.

### Stage rules

- **Win condition** for v1: knock out every bot (the existing rule). The stage
  data holds an `objective` field that can only be `"knockout"` for now, so later
  objectives such as "survive 60s" are a new known ID, not new code paths.
- **Rounds:** one round per stage, matching today's loop. A stage can set
  `roundsToWin` (default 1) so later acts can use best-of-3 without changing the
  data shape.
- **Retries:** unlimited. A loss returns to the briefing with a hint drawn from
  the bot's `quirk`.
- **Stars** (0–3) for replay value, all from facts the round already reports:
  - ★ clear the stage
  - ★ clear it under the stage's par time (`durationMs`)
  - ★ clear at least the stage's block target (`blocksCleared`)

  A stage is cleared at one star. Act unlocks need clears only, never stars.

---

## 3. Simulation layer (pure, tested)

New module `src/game/simulation/campaign.ts`. It holds the stage table and the
rules over it, with no Phaser, React or I/O.

```ts
export type CampaignStageId = "1-1" | "1-2" | ... | "3-3";

export type ArenaPresetId = "standard" | "open-core" | "maze";

export type StageBotSpec = {
  profileId: BotProfileId;
  traitDelta?: Partial<BotTraitSet>;      // clamped to 0–10 after applying
  startingLoadout?: Partial<PlayerLoadout>; // clamped to MAX_LOADOUT
};

export type CampaignStage = {
  id: CampaignStageId;
  act: 1 | 2 | 3;
  title: string;                  // "Overclocked"
  brief: string;                  // one-line briefing copy
  arena: { cols: number; rows: number; preset: ArenaPresetId };
  bots: StageBotSpec[];           // 1 or 2
  modifiers: {
    botFuseMs?: number;           // bounded 1200–2400
    botMoveScale?: number;        // bounded 0.7–1.3, multiplies move delay
    powerupDropRates?: PowerupDropRates;
  };
  objective: "knockout";
  roundsToWin: number;
  parTimeMs: number;
  blockTarget: number;
};

export type CampaignProgress = {
  stages: Partial<Record<CampaignStageId, { stars: 0 | 1 | 2 | 3; bestTimeMs: number }>>;
};

export const CAMPAIGN_STAGES: readonly CampaignStage[];
export function isStageUnlocked(progress: CampaignProgress, id: CampaignStageId): boolean;
export function getNextStage(progress: CampaignProgress): CampaignStage | null;
export function scoreStageResult(stage: CampaignStage, result: RoundFacts): 0 | 1 | 2 | 3;
export function applyStageResult(progress, id, result): CampaignProgress; // keeps best stars/time
export function resolveStageBot(spec: StageBotSpec): { profile: BotProfile; loadout: ActorLoadout };
```

All tuning is **data mapped to bounded numbers and known IDs**, the same pattern
`ARCHITECTURE.md` requires for future LLM persona patches. `resolveStageBot` is
the one place a modified profile is built, and it clamps every trait.

### Arena generalisation (needed from Act 2)

`arena.ts` currently hard-codes `ARENA_COLS`/`ARENA_ROWS`, and they are read by
`ArenaScene`, `DuelScene`, `arenaViews.ts` and `overdriveTextures.ts`.

- Add `createArena(spec: ArenaSpec, seed: number): ArenaGrid` and
  `getSpawnPoints(arena): GridPoint[]` (the four corners).
- `createInitialArena()` becomes `createArena(DEFAULT_ARENA_SPEC, 0)`, so duels,
  the realtime server and existing tests stay unchanged.
- Rendering reads `arena[0].length` and `arena.length` instead of the constants.
  The constants remain as the defaults.
- Presets change only soft-block placement (and keep spawn corners clear), so
  blast, danger and walkability rules are untouched.

### Two-bot gauntlet (Act 2-5)

`ArenaScene` already runs `bot-a` and `bot-b` in Skirmish and `player` +
`bot-a` in Local Match. A gauntlet spawns all three. The win rule becomes "the
player wins when no bots are alive and the player is". That should be a small
pure helper, `resolveRoundWinner(actors)`, with tests, rather than more branches
in `completeRound`. The `BotTurnContext.opponentTile` the bots receive stays the
player's tile, so bots do not target each other.

### Large boards (Act 3)

- **Camera:** `computeArenaBoardFit` shrinks the board to fit and never
  upscales. That is right up to about 13×11, but a 25×19 board on a phone would
  shrink to unreadable tiles. Add a pure `computeFollowCamera(viewport, board,
  { minVisibleCols: 11, minVisibleRows: 9 })` to `layout.ts` that picks a zoom
  showing about that many tiles. `ArenaScene` then uses Phaser
  `startFollow(player)` with `setBounds` on the board. Boards that fit keep
  today's path.
- **Minimap:** a second, fixed Phaser camera rendering the board at a small zoom
  in a corner (presentation only, no new React↔Phaser traffic per frame).
- **Off-screen indicators:** edge arrows tinted with each bot's accent, plus a
  pulse when an off-screen bomb is about to go off.
- **Bot AI check:** `findFirstStepToward` is an unbounded BFS, so it is correct
  on big boards; its cost is O(cells) per tick. On 25×19 (475 cells) at a
  120ms tick that is fine, but Act 3 adds a test asserting bots make progress
  toward a distant player.

---

## 4. React ↔ Phaser contract

Additions to `GameEvents` in `createGame.ts`, following the existing
`getBotSelection` pull pattern:

```ts
getCampaignStage?: () => CampaignStageId | null;   // read in startMode()
```

```ts
export type RoundCompletePayload = {
  mode: GameMode;
  winner: ScoreWinner;
  durationMs: number;
  blocksCleared: number;
  stageId?: CampaignStageId;   // present when mode === "campaign"
};
```

Phaser resolves the stage itself from the pure `CAMPAIGN_STAGES` table, so only
the ID crosses the boundary. `ArenaScene.startMode("campaign")` builds the arena
from `stage.arena`, spawns the resolved bots with their loadouts, and applies
`modifiers` where it now uses `BOT_FUSE_MS`, `BASE_BOT_MOVE_MS` and the drop
rates.

---

## 5. Persistence and trust

The house pattern is that career totals are **derived from stored `matches`**
rather than incremented, so retries can never double count. Campaign progress
follows the same pattern.

- `POST /api/matches` accepts `mode: "campaign"` with a required `stageId`
  (Zod: a known ID; the superRefine rejects a missing ID for campaign and a
  present one for other modes). Winners are `player | bot | draw`.
- Before writing, the server re-derives the player's progress from their stored
  campaign matches and rejects a result for a stage that isn't unlocked (4xx,
  `{ ok: false, error }`).
- `GET /api/profile` returns `campaign: CampaignProgress`, derived by the same
  pure `applyStageResult` folded over stored wins. No new collection, and an
  index on `{ accountId: 1, mode: 1, createdAt: -1 }` already exists.
- `player-career.ts` currently counts only `player-vs-bot` as a local match.
  Campaign rounds count as local matches too, so XP and stats include them.
- **Offline / no Mongo:** progress is mirrored in `client-storage.ts` (the
  existing localStorage helper) so dev and Mongo-less runs still advance. The
  server-derived value wins when it is available.
- **Trust level:** results stay client-reported, like Local Match today. Campaign
  progress is personal and unranked, and it must not gate anything scarce. Stars
  and clear times are not leaderboard material.

Scoring gets a `campaign` entry in `MODE_BONUS` so campaign rounds still post a
score for the personal-best line.

---

## 6. UI design

The design pass follows `/neon-fuse-ui`. Everything uses the existing `:root`
tokens; no new color token is needed, and stars use `--amber`.

### Entry point: mode row

`.command-row` becomes **Campaign · Versus · Skirmish · Friend**.

- Campaign is the primary (non-`secondary`) button and opens the Campaign
  screen. "Local Match" becomes **Versus** and opens the opponent picker instead
  of starting immediately.
- Compact labels for phones: `Campaign`, `Versus`, `Skirmish`, `Friend`. Four
  segmented pills at ≤760px must be checked on a real 360px viewport. If they
  don't fit, Friend moves into `ShellMenu`, the tier the UI skill prescribes for
  less urgent destinations.

### Campaign screen (dialog)

Reuses the `.admin-dialog` frame (corner ticks) and the two-column
`.bot-lab-grid` structure.

```
┌ CAMPAIGN ───────────────────────────────── Close ┐
│ [ Act 1 ] [ Act 2 🔒 ] [ Act 3 🔒 ]   ← aria-pressed
│ ┌──────────────────┐  ┌───────────────────────┐ │
│ │ ● 1-1 Fuse Rush ★★☆ │  │ [portrait]  STAGE 1-3  │ │
│ │ │                │  │ Volt Warden            │ │
│ │ ● 1-2 Circuit S. ★☆☆│  │ "Trap-setting defender"│ │
│ │ │                │  │ INTEL  Keeps exits...  │ │
│ │ ◉ 1-3 Volt W.  NEXT │  │ [13×11] [1v1] [Par 1:30]│ │
│ │ │                │  │ ★ Clear ★ Par ★ 12 blocks│ │
│ │ ○ 1-4 Glitch B.  🔒 │  │        [ START STAGE ] │ │
│ └──────────────────┘  └───────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- **Ladder (left):** a vertical "circuit trace" of stage cards joined by a 1px
  `--line` connector that turns `--line-strong` once cleared. New classes:
  `.campaign-ladder`, `.campaign-stage-card` (added to the chamfer card list in
  the "Overdrive surfaces" block), `.campaign-stars`. State is shown through
  attributes, never extra classes: `aria-pressed` for the selected card and
  `data-state="cleared|next|locked"`. The next stage glows `--cyan` and cleared
  stages show a `--green` tick.
- **Briefing (right):** `.campaign-briefing`, `aria-live="polite"`.
  `<FusebotPortrait>` for each opponent (two for a gauntlet), the bot `tagline`,
  the `quirk` as "Intel", modifiers as `.trait-pill`s, the three star goals, and
  a primary `.command-button` "Start stage".
- **Locked stages** stay focusable buttons with `aria-disabled="true"`. The
  briefing explains how to unlock them ("Clear 1-2 to unlock") and Start is
  disabled.
- **Act tabs:** a segmented `aria-pressed` group. Locked acts show their unlock
  rule.
- **≤760px:** one column. The ladder becomes a horizontal, scroll-snapped strip
  of portrait chips above the briefing, and Start stays reachable without
  scrolling.
- **Escape / backdrop close:** wired into the existing `keydown` handler in
  `GameShell`.

### In-match HUD

- In campaign mode the **Record** chip becomes a **Stage** chip
  (`1-3 · Volt Warden`) using `.hud-chip`. Gauntlets show a bot-count chip
  ("Bots 2/2").
- The existing goal line reads `Goal: Clear stage 1-3 · Par 1:30`.
- `RoundBanner` gains a campaign caption ("Stage 1-3 cleared") by mapping a new
  status string, following its "add callouts here" rule.

### Result panel

Shown after the KO/Down banner settles, in place of the generic result in
campaign mode. Dialog semantics.

- **Win:** stars fill one by one in `--amber` with a glow (no animation under
  `prefers-reduced-motion`; the existing `motionPreference.ts` covers Phaser,
  and CSS uses the media query). Buttons: **Next stage** (primary), Retry,
  Campaign map. Unlocking a new act shows a one-line callout.
- **Loss:** **Retry** (primary), Campaign map, plus an Intel tip from the bot's
  quirk.
- New classes: `.campaign-result`, `.campaign-star[data-earned]`.

### Versus picker (later phase)

A dialog with the four bots as large `.bot-roster-button` cards with portraits,
plus the existing detail panel (reuse the Bot Lab detail markup), and a "Fight"
button. It writes `botSelection["bot-a"]` exactly as Bot Lab does today, so
preferences and Mongo shape are unchanged. All base bots are always available.
Campaign clears unlock their **Overclocked** variants here as a reward, not a
gate.

---

## 7. Delivery plan

Each phase is one reviewable PR that passes the full gate (lint, typecheck,
test, build, e2e).

**Phase 1: Campaign foundation (Act 1)**
1. `campaign.ts` with the Act 1 stage table, unlock, stars and progress folding,
   plus `campaign.test.ts`.
2. `GameMode` `"campaign"`; `getCampaignStage` and `stageId` on the
   `GameEvents` contract; `ArenaScene.startMode` reads the stage (Act 1 needs
   only opponent selection).
3. Match schema and scoring for `campaign`; server-side unlock check;
   `GET /api/profile` returns derived `campaign`; career counts campaign
   rounds; localStorage mirror.
4. Campaign screen, briefing, Stage HUD chip, and result panel.
5. e2e: open Campaign, see 1-1 unlocked and 1-2 locked, start 1-1, and see the
   Stage chip. Unit tests for schema refinements.

**Phase 2: Overclock (Act 2)**: `createArena(spec)` and presets, bot
modifiers via `resolveStageBot`, the gauntlet win rule, and the Act 2 stage
data.

**Phase 3: Megagrid (Act 3)**: variable board dimensions in rendering,
`computeFollowCamera`, follow camera, minimap, off-screen indicators, and a
large-board bot test.

**Phase 4: Versus picker**: the roster dialog, the mode-row change, and
Overclocked variant unlocks.

---

## 8. Open decisions

| Question | Recommendation |
| --- | --- |
| One round or best-of-3 per stage? | One round in Act 1 for pace; data supports more later. |
| Lock Versus opponents behind the campaign? | No. Base bots stay free; campaign unlocks Overclocked variants. |
| Server-persisted or local-only progress? | Server-derived from `matches` with a local mirror, matching career totals. |
| New bot personalities for Acts 2–3? | Not needed for the plan as written. A final boss would need a new `BotProfileId`, Fusebot art, and a profile-schema enum update. |
| Achievements/titles for clears? | Yes, in Phase 1 or 2: "Ladder Climber" (Act 1), "Overclocked" (Act 2), "Megagrid" (Act 3), derived like the existing achievements. |
