import * as Phaser from "phaser";
import { CELL_SIZE, type GridPoint } from "../simulation/arena";
import type { BlastResult } from "../simulation/blast";

type ExplosionScene = Pick<Phaser.Scene, "add" | "cameras" | "time" | "tweens">;

const BLAST_DEPTH = 200;
const SCORCH_DEPTH = 2;
const STAGGER_MS = 38;
const FLAME_MS = 520;

/**
 * Shared cosmetic blast renderer. Gameplay outcomes stay in the simulation;
 * this only reads the resolved tiles. `tiles[0]` is always the bomb's origin.
 */
export function playExplosionEffect(
  scene: ExplosionScene,
  blast: BlastResult,
  tileToWorld: (tile: GridPoint) => GridPoint
) {
  const origin = blast.tiles[0];

  if (!origin) {
    return;
  }

  const center = tileToWorld(origin);
  const cleared = new Set(blast.clearedBlocks.map((tile) => `${tile.x}:${tile.y}`));

  // Flash of light that washes over nearby walls and fighters.
  const flash = scene.add
    .image(center.x, center.y, "glow")
    .setTint(0xffc46b)
    .setScale(1.2)
    .setAlpha(0.95)
    .setDepth(BLAST_DEPTH + 3)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: flash,
    scale: 3.6 + blast.tiles.length * 0.18,
    alpha: 0,
    duration: 420,
    ease: "Cubic.easeOut",
    onComplete: () => flash.destroy()
  });

  const ring = scene.add
    .image(center.x, center.y + 6, "shock-ring")
    .setTint(0x22d3ee)
    .setScale(0.2, 0.13)
    .setAlpha(0.9)
    .setDepth(BLAST_DEPTH + 2)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ring,
    scaleX: 1.9,
    scaleY: 1.2,
    alpha: 0,
    duration: 520,
    ease: "Quad.easeOut",
    onComplete: () => ring.destroy()
  });

  blast.tiles.forEach((tile) => {
    const dx = Math.sign(tile.x - origin.x);
    const dy = Math.sign(tile.y - origin.y);
    const distance = Math.abs(tile.x - origin.x) + Math.abs(tile.y - origin.y);
    const isOrigin = distance === 0;
    const breaksCrate = cleared.has(`${tile.x}:${tile.y}`);

    scene.time.delayedCall(distance * STAGGER_MS, () => {
      playFlameTile(scene, tileToWorld(tile), { dx, dy, isOrigin, breaksCrate });
    });
  });

  scene.cameras.main.shake(200, 0.009);
}

function playFlameTile(
  scene: ExplosionScene,
  world: GridPoint,
  { dx, dy, isOrigin, breaksCrate }: { dx: number; dy: number; isOrigin: boolean; breaksCrate: boolean }
) {
  const horizontal = dx !== 0;
  const vertical = dy !== 0;
  const along = CELL_SIZE + 4;
  const across = CELL_SIZE * 0.7;
  const coreAcross = CELL_SIZE * 0.32;

  const glow = scene.add
    .image(world.x, world.y - 4, "blast-glow")
    .setDisplaySize(isOrigin || horizontal ? along + 20 : across + 20, isOrigin || vertical ? along + 20 : across + 20)
    .setDepth(BLAST_DEPTH)
    .setBlendMode(Phaser.BlendModes.ADD);
  const core = scene.add
    .image(world.x, world.y - 4, "blast-core")
    .setDisplaySize(isOrigin || horizontal ? along : coreAcross, isOrigin || vertical ? along : coreAcross)
    .setDepth(BLAST_DEPTH + 1)
    .setBlendMode(Phaser.BlendModes.ADD);

  if (isOrigin) {
    core.setDisplaySize(CELL_SIZE * 0.8, CELL_SIZE * 0.8);
  }

  scene.tweens.add({
    targets: [glow, core],
    alpha: 0,
    duration: FLAME_MS,
    ease: "Cubic.easeIn",
    onComplete: () => {
      glow.destroy();
      core.destroy();
    }
  });
  scene.tweens.add({
    targets: core,
    scaleX: core.scaleX * (vertical ? 0.4 : 1),
    scaleY: core.scaleY * (horizontal ? 0.4 : 1),
    duration: FLAME_MS,
    ease: "Quad.easeIn"
  });

  const sparks = scene.add.particles(world.x, world.y - 6, breaksCrate ? "debris" : "spark", {
    speed: { min: 40, max: breaksCrate ? 220 : 140 },
    angle: { min: 0, max: 360 },
    scale: { start: breaksCrate ? 1.1 : 0.9, end: 0 },
    rotate: breaksCrate ? { min: 0, max: 360 } : 0,
    lifespan: { min: 260, max: breaksCrate ? 720 : 480 },
    gravityY: breaksCrate ? 420 : 120,
    tint: breaksCrate ? [0xf43f5e, 0xfb7185, 0x4a1230] : [0xf59e0b, 0xfff7d6, 0xf43f5e],
    blendMode: breaksCrate ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD,
    emitting: false
  });
  sparks.setDepth(BLAST_DEPTH + 4);
  sparks.explode(breaksCrate ? 16 : isOrigin ? 14 : 5);
  scene.time.delayedCall(800, () => sparks.destroy());

  const scorch = scene.add
    .image(world.x, world.y, "scorch")
    .setAlpha(isOrigin ? 0.85 : 0.6)
    .setScale(isOrigin ? 0.95 : 0.75)
    .setAngle((world.x + world.y) % 360)
    .setDepth(SCORCH_DEPTH);
  scene.tweens.add({
    targets: scorch,
    alpha: 0,
    delay: 900,
    duration: 1800,
    onComplete: () => scorch.destroy()
  });
}
