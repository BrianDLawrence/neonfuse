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
