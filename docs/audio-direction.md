# 80s 32-Bit Audio Direction

## Intent

Build the game audio around an 80s arcade-action soundtrack with 32-bit-era polish: synthwave drive, FM sparkle, punchy drums, crunchy arcade one-shots, and explosive sound design that reacts to gameplay intensity.

The goal is not pure 8-bit chiptune. The target is closer to a neon arcade cabinet inside a VHS action movie: melodic, propulsive, bright, and physical.

## Audio Pillars

- **Music leads the emotion.** Loops should communicate pace, danger, victory, and escalation without fighting the playfield.
- **SFX sell impact.** Explosions, shots, impacts, pickups, and UI should feel short, readable, and tactile.
- **Events are the API.** Gameplay emits semantic audio events; the audio layer decides which assets, layers, pitch, volume, and mix treatment to use.
- **Variation prevents fatigue.** Repeated sounds use random variants, pitch windows, gain windows, and cooldowns.
- **The mix is playable.** Important gameplay feedback always cuts through the music.

## Runtime Architecture

```txt
Game Systems
  -> emit semantic audio events
AudioDirector
  -> routes events, owns global audio state
MusicManager
  -> loops, stems, crossfades, stingers, intensity
SfxManager
  -> one-shots, variants, cooldowns, pitch and volume randomization
Mixer
  -> master, music, sfx, ui, ambient buses
AudioManifest
  -> stable asset keys mapped to files
```

Game systems should never import individual audio files. They should emit events such as `enemy.exploded`, `weapon.fired`, or `wave.completed`.

## Mixer Buses

| Bus | Purpose | Notes |
| --- | --- | --- |
| `master` | Global output | User-facing master volume. |
| `music` | Background music and music stems | Duck briefly under major explosions. |
| `sfx` | Gameplay one-shots | Highest priority for combat readability. |
| `ui` | Menus, pause, selection, settings | Should stay crisp and short. |
| `ambient` | Optional environment beds | Keep subtle; avoid masking gameplay. |

## Music System

### Initial Tracks

| Key | Role | Direction |
| --- | --- | --- |
| `music.menu.loop` | Title, settings, upgrade screens | VHS pad, light arpeggio, slower tempo. |
| `music.gameplay.loop` | Default play state | Driving bass, bright arps, punchy 80s drums. |
| `music.gameplay.high` | Escalated combat | More percussion, brighter lead, thicker bass. |
| `music.boss.loop` | Boss or major threat | Darker harmony, bigger drums, aggressive lead. |

### Stingers

| Key | Trigger |
| --- | --- |
| `stinger.wave.start` | New wave begins. |
| `stinger.wave.complete` | Wave cleared. |
| `stinger.boss.enter` | Boss reveal or elite enemy entrance. |
| `stinger.player.death` | Player destroyed or run failed. |
| `stinger.victory` | Level or run completed. |
| `stinger.low.health` | First transition into critical health. |

### Intensity States

| State | Use |
| --- | --- |
| `calm` | Menus, between waves, safe moments. |
| `combat` | Normal active gameplay. |
| `danger` | Low health, dense enemy count, near failure. |
| `boss` | Boss or set-piece encounter. |
| `victory` | End-state celebration or win transition. |

Music transitions should use short crossfades by default:

- Menu to gameplay: 500-1000ms.
- Gameplay to danger: 300-700ms.
- Gameplay to boss: 800-1500ms with boss stinger.
- Any state to player death: stop or heavy low-pass within 200-400ms, then death stinger.

## SFX Event Map

### Explosions

| Event | Asset Group | Mix Treatment |
| --- | --- | --- |
| `explosion.small` | `sfx.explosion.small.*` | Short pop, slight pitch variation. |
| `explosion.medium` | `sfx.explosion.medium.*` | Noise crack plus synth body. |
| `explosion.large` | `sfx.explosion.large.*` | Music duck, low boom, wider stereo tail. |
| `explosion.chain` | `sfx.explosion.chain.*` | Tighter cooldown, alternating variants. |
| `explosion.boss` | `sfx.explosion.boss.*` | Full duck, long tail, optional stinger. |

Large and boss explosions should briefly duck the music bus by 20-35% for 150-300ms.

### Weapons

| Event | Asset Group | Notes |
| --- | --- | --- |
| `weapon.player.fire` | `sfx.weapon.player.fire.*` | Short, bright, low fatigue. |
| `weapon.player.hit` | `sfx.weapon.player.hit.*` | More body than fire sound. |
| `weapon.enemy.fire` | `sfx.weapon.enemy.fire.*` | Slightly darker than player fire. |
| `weapon.enemy.hit` | `sfx.weapon.enemy.hit.*` | Helps confirm damage. |
| `weapon.charge.start` | `sfx.weapon.charge.start` | Rising synth tone. |
| `weapon.charge.release` | `sfx.weapon.charge.release.*` | Bigger transient, duck optional. |

### Player State

| Event | Asset Group | Notes |
| --- | --- | --- |
| `player.damage` | `sfx.player.damage.*` | Must cut through music. |
| `player.shield.break` | `sfx.player.shield.break` | Glassy FM crack. |
| `player.health.low` | `stinger.low.health` | Trigger once per low-health entry. |
| `player.death` | `stinger.player.death` + `sfx.explosion.player` | Music stops or filters down. |
| `player.respawn` | `sfx.player.respawn` | Rising synth shimmer. |

### Enemies

| Event | Asset Group | Notes |
| --- | --- | --- |
| `enemy.spawn` | `sfx.enemy.spawn.*` | Short teleport or synth blip. |
| `enemy.damage` | `sfx.enemy.damage.*` | Quiet confirmation. |
| `enemy.destroyed` | `explosion.small` or `explosion.medium` | Route by enemy size. |
| `enemy.elite.spawn` | `sfx.enemy.elite.spawn` | Slightly longer warning. |
| `boss.enter` | `stinger.boss.enter` | Music moves to boss. |
| `boss.phase.change` | `sfx.boss.phase` | Add musical hit. |
| `boss.destroyed` | `explosion.boss` + `stinger.victory` | End-state punctuation. |

### Pickups And Rewards

| Event | Asset Group | Notes |
| --- | --- | --- |
| `pickup.collected` | `sfx.pickup.generic.*` | Fast upward arpeggio. |
| `pickup.health` | `sfx.pickup.health` | Warmer tone. |
| `pickup.powerup` | `sfx.pickup.powerup` | Bigger 80s synth sparkle. |
| `score.combo.up` | `sfx.score.combo.*` | Ascending sequence by combo tier. |
| `reward.unlocked` | `sfx.reward.unlock` | UI/music hybrid. |

### Wave And Game Flow

| Event | Asset Group | Notes |
| --- | --- | --- |
| `wave.countdown.tick` | `sfx.ui.countdown` | Short and restrained. |
| `wave.started` | `stinger.wave.start` | Move to combat intensity. |
| `wave.completed` | `stinger.wave.complete` | Brief relief, maybe lower intensity. |
| `game.paused` | `sfx.ui.pause` | Optional music low-pass. |
| `game.resumed` | `sfx.ui.resume` | Restore mix. |
| `game.victory` | `stinger.victory` | Move to victory state. |
| `game.over` | `stinger.player.death` | Move to failure state. |

### UI

| Event | Asset Group | Notes |
| --- | --- | --- |
| `ui.move` | `sfx.ui.move` | Tiny arcade tick. |
| `ui.confirm` | `sfx.ui.confirm` | Bright, positive. |
| `ui.cancel` | `sfx.ui.cancel` | Lower pitch. |
| `ui.error` | `sfx.ui.error` | Short, non-irritating. |
| `ui.setting.changed` | `sfx.ui.setting` | Very short tick. |

## Manifest Shape

```ts
export const audioManifest = {
  music: {
    "music.menu.loop": "/audio/music/menu_loop.ogg",
    "music.gameplay.loop": "/audio/music/gameplay_loop.ogg",
    "music.gameplay.high": "/audio/music/gameplay_high.ogg",
    "music.boss.loop": "/audio/music/boss_loop.ogg"
  },
  stingers: {
    "stinger.wave.start": "/audio/stingers/wave_start.ogg",
    "stinger.wave.complete": "/audio/stingers/wave_complete.ogg",
    "stinger.boss.enter": "/audio/stingers/boss_enter.ogg",
    "stinger.player.death": "/audio/stingers/player_death.ogg",
    "stinger.victory": "/audio/stingers/victory.ogg",
    "stinger.low.health": "/audio/stingers/low_health.ogg"
  },
  sfx: {
    "sfx.explosion.small.01": "/audio/sfx/explosions/small_01.ogg",
    "sfx.explosion.small.02": "/audio/sfx/explosions/small_02.ogg",
    "sfx.explosion.medium.01": "/audio/sfx/explosions/medium_01.ogg",
    "sfx.explosion.large.01": "/audio/sfx/explosions/large_01.ogg",
    "sfx.weapon.player.fire.01": "/audio/sfx/weapons/player_fire_01.ogg",
    "sfx.ui.confirm": "/audio/sfx/ui/confirm.ogg"
  }
} as const;
```

## Event Rule Shape

```ts
export const audioEvents = {
  "explosion.large": {
    bus: "sfx",
    variants: [
      "sfx.explosion.large.01",
      "sfx.explosion.large.02",
      "sfx.explosion.large.03"
    ],
    volume: [0.85, 1],
    pitch: [0.92, 1.06],
    cooldownMs: 80,
    duckMusic: {
      amount: 0.3,
      attackMs: 20,
      holdMs: 120,
      releaseMs: 180
    }
  }
} as const;
```

## Folder Layout

```txt
src/audio/
  AudioDirector.ts
  MusicManager.ts
  SfxManager.ts
  Mixer.ts
  audioEvents.ts
  audioManifest.ts
  types.ts

public/audio/
  music/
  stingers/
  sfx/
    explosions/
    weapons/
    enemies/
    player/
    pickups/
    ui/
```

## First Implementation Milestone

1. Add the audio module skeleton with typed events and manifest keys.
2. Add placeholder generated or royalty-safe audio assets:
   - one menu loop
   - one gameplay loop
   - one high-intensity loop or layer
   - three explosion variants
   - one player fire sound
   - one UI confirm sound
3. Wire gameplay to semantic events:
   - `wave.started`
   - `explosion.small`
   - `explosion.large`
   - `weapon.player.fire`
   - `player.damage`
   - `player.death`
4. Add settings controls for master, music, and SFX volume.
5. Verify in browser:
   - music unlocks after user gesture
   - loops are gapless enough for gameplay
   - rapid explosions do not clip
   - large explosions duck music without swallowing other SFX

## Asset Production Notes

- Export web runtime files as `.ogg`; add `.mp3` fallback only if the target platform needs it.
- Keep SFX short and normalized with headroom.
- Leave a little silence-free tail on looping music files to avoid click artifacts.
- Avoid copyrighted 80s references. Use era-inspired synthesis, rhythm, and mix choices rather than recreating recognizable songs.
- Store source project files separately from shipped runtime audio if we later add a production asset pipeline.
