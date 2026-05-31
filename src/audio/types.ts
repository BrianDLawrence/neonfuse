export type AudioBusName = "master" | "music" | "sfx" | "ui" | "ambient";

export type MusicIntensity = "calm" | "combat" | "danger" | "boss" | "victory";

export type AudioEventName =
  | "explosion.small"
  | "explosion.medium"
  | "explosion.large"
  | "explosion.chain"
  | "explosion.boss"
  | "weapon.player.fire"
  | "weapon.player.hit"
  | "weapon.enemy.fire"
  | "weapon.enemy.hit"
  | "weapon.charge.start"
  | "weapon.charge.release"
  | "player.damage"
  | "player.shield.break"
  | "player.health.low"
  | "player.death"
  | "player.respawn"
  | "enemy.spawn"
  | "enemy.damage"
  | "enemy.destroyed"
  | "enemy.elite.spawn"
  | "boss.enter"
  | "boss.phase.change"
  | "boss.destroyed"
  | "pickup.collected"
  | "pickup.health"
  | "pickup.powerup"
  | "score.combo.up"
  | "reward.unlocked"
  | "wave.countdown.tick"
  | "wave.started"
  | "wave.completed"
  | "game.paused"
  | "game.resumed"
  | "game.victory"
  | "game.over"
  | "ui.move"
  | "ui.confirm"
  | "ui.cancel"
  | "ui.error"
  | "ui.setting.changed";

export type AudioAssetKey =
  | "music.menu.loop"
  | "music.gameplay.loop"
  | "music.gameplay.high"
  | "music.boss.loop"
  | "stinger.wave.start"
  | "stinger.wave.complete"
  | "stinger.boss.enter"
  | "stinger.player.death"
  | "stinger.victory"
  | "stinger.low.health"
  | "sfx.explosion.small.01"
  | "sfx.explosion.small.02"
  | "sfx.explosion.small.03"
  | "sfx.explosion.medium.01"
  | "sfx.explosion.medium.02"
  | "sfx.explosion.large.01"
  | "sfx.explosion.large.02"
  | "sfx.explosion.large.03"
  | "sfx.explosion.boss.01"
  | "sfx.weapon.player.fire.01"
  | "sfx.weapon.player.fire.02"
  | "sfx.weapon.player.hit.01"
  | "sfx.weapon.enemy.fire.01"
  | "sfx.weapon.enemy.hit.01"
  | "sfx.weapon.charge.start"
  | "sfx.weapon.charge.release.01"
  | "sfx.player.damage.01"
  | "sfx.player.shield.break"
  | "sfx.player.respawn"
  | "sfx.player.explosion"
  | "sfx.enemy.spawn.01"
  | "sfx.enemy.damage.01"
  | "sfx.enemy.elite.spawn"
  | "sfx.boss.phase"
  | "sfx.pickup.generic.01"
  | "sfx.pickup.generic.02"
  | "sfx.pickup.health"
  | "sfx.pickup.powerup"
  | "sfx.score.combo.01"
  | "sfx.reward.unlock"
  | "sfx.ui.countdown"
  | "sfx.ui.pause"
  | "sfx.ui.resume"
  | "sfx.ui.move"
  | "sfx.ui.confirm"
  | "sfx.ui.cancel"
  | "sfx.ui.error"
  | "sfx.ui.setting";

export type MusicWaveform = "sine" | "square" | "sawtooth" | "triangle";

export type MusicLayerRole = "lead" | "arp" | "bass" | "pad";

export type MusicAccent = "cyan" | "pink" | "green" | "amber";

// One monophonic synth voice: a looping pattern of note names (or rests).
export type MusicLayer = {
  role: MusicLayerRole;
  waveform: MusicWaveform;
  // Note names like "a3" / "f#4", or null for a rest. Length defines the loop.
  pattern: (string | null)[];
  stepsPerNote?: number; // how many sequencer steps each entry holds (default 1)
  octaveShift?: number; // -3..3
  gain: number; // 0..1 relative voice volume
  detune?: number; // cents
  // Which intensities this layer is audible in (default: all of them).
  intensities?: MusicIntensity[];
};

// A fully data-driven, JSON-serializable music track the synth engine renders.
// Lives here (no Phaser/React/Mongo) so the engine, React, and the Zod schema
// can all share one plain-data shape.
export type MusicTrack = {
  id: string; // stable slug, e.g. "mach-rush"
  title: string;
  subtitle: string; // vibe hint, e.g. "80s jet-fuel synth-rock"
  inspiration: string; // "Inspired by the adrenaline of Top Gun"
  bpm: number; // 40..240; step length is derived from this
  filterBase: number; // base lowpass cutoff (Hz)
  accent: MusicAccent; // maps to a palette token on the Music screen
  layers: MusicLayer[];
  intensityProfiles?: Partial<
    Record<MusicIntensity, { tempoMul?: number; cutoffMul?: number; gainMul?: number }>
  >;
  source: "builtin" | "custom";
};

export type AudioEventPayload = {
  intensity?: MusicIntensity;
  size?: "small" | "medium" | "large" | "boss";
  comboTier?: number;
  x?: number;
  y?: number;
};

export type AudioDuckRule = {
  amount: number;
  attackMs: number;
  holdMs: number;
  releaseMs: number;
};

export type AudioEventRule = {
  bus: AudioBusName;
  variants: AudioAssetKey[];
  playMode?: "random" | "layered";
  volume?: readonly [number, number];
  pitch?: readonly [number, number];
  cooldownMs?: number;
  duckMusic?: AudioDuckRule;
  musicIntensity?: MusicIntensity;
};
