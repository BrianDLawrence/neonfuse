import type { AudioEventName, AudioEventRule } from "./types";

export const audioEvents: Record<AudioEventName, AudioEventRule> = {
  "explosion.small": {
    bus: "sfx",
    variants: ["sfx.explosion.small.01", "sfx.explosion.small.02", "sfx.explosion.small.03"],
    volume: [0.55, 0.8],
    pitch: [0.95, 1.12],
    cooldownMs: 25
  },
  "explosion.medium": {
    bus: "sfx",
    variants: ["sfx.explosion.medium.01", "sfx.explosion.medium.02"],
    volume: [0.7, 0.95],
    pitch: [0.92, 1.08],
    cooldownMs: 45
  },
  "explosion.large": {
    bus: "sfx",
    variants: ["sfx.explosion.large.01", "sfx.explosion.large.02", "sfx.explosion.large.03"],
    volume: [0.85, 1],
    pitch: [0.9, 1.05],
    cooldownMs: 80,
    duckMusic: { amount: 0.3, attackMs: 20, holdMs: 120, releaseMs: 180 }
  },
  "explosion.chain": {
    bus: "sfx",
    variants: ["sfx.explosion.small.01", "sfx.explosion.medium.01", "sfx.explosion.small.02"],
    volume: [0.55, 0.85],
    pitch: [0.9, 1.15],
    cooldownMs: 35
  },
  "explosion.boss": {
    bus: "sfx",
    variants: ["sfx.explosion.boss.01"],
    volume: [0.95, 1],
    pitch: [0.88, 0.98],
    cooldownMs: 500,
    duckMusic: { amount: 0.45, attackMs: 20, holdMs: 240, releaseMs: 420 },
    musicIntensity: "victory"
  },
  "weapon.player.fire": {
    bus: "sfx",
    variants: ["sfx.weapon.player.fire.01", "sfx.weapon.player.fire.02"],
    volume: [0.38, 0.55],
    pitch: [0.98, 1.08],
    cooldownMs: 20
  },
  "weapon.player.hit": {
    bus: "sfx",
    variants: ["sfx.weapon.player.hit.01"],
    volume: [0.45, 0.7],
    pitch: [0.96, 1.06],
    cooldownMs: 30
  },
  "weapon.enemy.fire": {
    bus: "sfx",
    variants: ["sfx.weapon.enemy.fire.01"],
    volume: [0.35, 0.55],
    pitch: [0.92, 1.04],
    cooldownMs: 35
  },
  "weapon.enemy.hit": {
    bus: "sfx",
    variants: ["sfx.weapon.enemy.hit.01"],
    volume: [0.4, 0.65],
    pitch: [0.94, 1.08],
    cooldownMs: 30
  },
  "weapon.charge.start": {
    bus: "sfx",
    variants: ["sfx.weapon.charge.start"],
    volume: [0.5, 0.65],
    pitch: [1, 1]
  },
  "weapon.charge.release": {
    bus: "sfx",
    variants: ["sfx.weapon.charge.release.01"],
    volume: [0.75, 0.95],
    pitch: [0.94, 1.02],
    duckMusic: { amount: 0.18, attackMs: 15, holdMs: 80, releaseMs: 120 }
  },
  "player.damage": {
    bus: "sfx",
    variants: ["sfx.player.damage.01"],
    volume: [0.75, 0.9],
    pitch: [0.96, 1.04],
    cooldownMs: 120
  },
  "player.shield.break": {
    bus: "sfx",
    variants: ["sfx.player.shield.break"],
    volume: [0.9, 1],
    pitch: [0.96, 1.02],
    duckMusic: { amount: 0.2, attackMs: 10, holdMs: 80, releaseMs: 180 }
  },
  "player.health.low": {
    bus: "ui",
    variants: ["stinger.low.health"],
    volume: [0.8, 0.9],
    pitch: [1, 1],
    cooldownMs: 5000,
    musicIntensity: "danger"
  },
  "player.death": {
    bus: "sfx",
    variants: ["sfx.player.explosion", "stinger.player.death"],
    playMode: "layered",
    volume: [0.9, 1],
    pitch: [0.95, 1],
    cooldownMs: 1000,
    duckMusic: { amount: 0.5, attackMs: 10, holdMs: 300, releaseMs: 700 }
  },
  "player.respawn": {
    bus: "sfx",
    variants: ["sfx.player.respawn"],
    volume: [0.65, 0.8],
    pitch: [1, 1.04]
  },
  "enemy.spawn": {
    bus: "sfx",
    variants: ["sfx.enemy.spawn.01"],
    volume: [0.35, 0.55],
    pitch: [0.95, 1.1],
    cooldownMs: 45
  },
  "enemy.damage": {
    bus: "sfx",
    variants: ["sfx.enemy.damage.01"],
    volume: [0.28, 0.45],
    pitch: [0.96, 1.12],
    cooldownMs: 25
  },
  "enemy.destroyed": {
    bus: "sfx",
    variants: ["sfx.explosion.small.01", "sfx.explosion.medium.01"],
    volume: [0.6, 0.9],
    pitch: [0.9, 1.12],
    cooldownMs: 35
  },
  "enemy.elite.spawn": {
    bus: "sfx",
    variants: ["sfx.enemy.elite.spawn"],
    volume: [0.75, 0.9],
    pitch: [0.95, 1.02],
    musicIntensity: "danger"
  },
  "boss.enter": {
    bus: "music",
    variants: ["stinger.boss.enter"],
    volume: [0.85, 1],
    pitch: [1, 1],
    musicIntensity: "boss"
  },
  "boss.phase.change": {
    bus: "sfx",
    variants: ["sfx.boss.phase"],
    volume: [0.85, 1],
    pitch: [0.94, 1],
    duckMusic: { amount: 0.25, attackMs: 20, holdMs: 150, releaseMs: 260 }
  },
  "boss.destroyed": {
    bus: "sfx",
    variants: ["sfx.explosion.boss.01", "stinger.victory"],
    playMode: "layered",
    volume: [0.95, 1],
    pitch: [0.9, 1],
    musicIntensity: "victory"
  },
  "pickup.collected": {
    bus: "sfx",
    variants: ["sfx.pickup.generic.01", "sfx.pickup.generic.02"],
    volume: [0.45, 0.65],
    pitch: [0.98, 1.14],
    cooldownMs: 20
  },
  "pickup.health": {
    bus: "sfx",
    variants: ["sfx.pickup.health"],
    volume: [0.55, 0.75],
    pitch: [1, 1.05]
  },
  "pickup.powerup": {
    bus: "sfx",
    variants: ["sfx.pickup.powerup"],
    volume: [0.7, 0.9],
    pitch: [0.98, 1.04]
  },
  "score.combo.up": {
    bus: "sfx",
    variants: ["sfx.score.combo.01"],
    volume: [0.45, 0.65],
    pitch: [1, 1.2],
    cooldownMs: 80
  },
  "reward.unlocked": {
    bus: "ui",
    variants: ["sfx.reward.unlock"],
    volume: [0.75, 0.9],
    pitch: [1, 1.03]
  },
  "wave.countdown.tick": {
    bus: "ui",
    variants: ["sfx.ui.countdown"],
    volume: [0.35, 0.5],
    pitch: [1, 1.06]
  },
  "wave.started": {
    bus: "music",
    variants: ["stinger.wave.start"],
    volume: [0.75, 0.9],
    pitch: [1, 1],
    musicIntensity: "combat"
  },
  "wave.completed": {
    bus: "music",
    variants: ["stinger.wave.complete"],
    volume: [0.75, 0.9],
    pitch: [1, 1],
    musicIntensity: "calm"
  },
  "game.paused": {
    bus: "ui",
    variants: ["sfx.ui.pause"],
    volume: [0.6, 0.75],
    pitch: [1, 1]
  },
  "game.resumed": {
    bus: "ui",
    variants: ["sfx.ui.resume"],
    volume: [0.6, 0.75],
    pitch: [1, 1]
  },
  "game.victory": {
    bus: "music",
    variants: ["stinger.victory"],
    volume: [0.85, 1],
    pitch: [1, 1],
    musicIntensity: "victory"
  },
  "game.over": {
    bus: "music",
    variants: ["stinger.player.death"],
    volume: [0.85, 1],
    pitch: [1, 1]
  },
  "ui.move": {
    bus: "ui",
    variants: ["sfx.ui.move"],
    volume: [0.25, 0.4],
    pitch: [0.98, 1.06],
    cooldownMs: 15
  },
  "ui.confirm": {
    bus: "ui",
    variants: ["sfx.ui.confirm"],
    volume: [0.45, 0.6],
    pitch: [1, 1.04]
  },
  "ui.cancel": {
    bus: "ui",
    variants: ["sfx.ui.cancel"],
    volume: [0.4, 0.55],
    pitch: [0.96, 1]
  },
  "ui.error": {
    bus: "ui",
    variants: ["sfx.ui.error"],
    volume: [0.45, 0.6],
    pitch: [0.98, 1]
  },
  "ui.setting.changed": {
    bus: "ui",
    variants: ["sfx.ui.setting"],
    volume: [0.25, 0.4],
    pitch: [0.96, 1.06],
    cooldownMs: 20
  }
};
