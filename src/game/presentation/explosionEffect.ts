import * as Phaser from "phaser";
import { CELL_SIZE, type GridPoint } from "../simulation/arena";
import type { BlastResult } from "../simulation/blast";

type ExplosionScene = Pick<Phaser.Scene, "add" | "cameras" | "time" | "tweens">;

/** Shared cosmetic blast renderer. Gameplay outcomes stay in the simulation. */
export function playExplosionEffect(
  scene: ExplosionScene,
  blast: BlastResult,
  tileToWorld: (tile: GridPoint) => GridPoint
) {
  blast.tiles.forEach((blastTile, index) => {
    scene.time.delayedCall(index * 24, () => {
      const didClearBlock = blast.clearedBlocks.some(
        (block) => block.x === blastTile.x && block.y === blastTile.y
      );
      const world = tileToWorld(blastTile);
      const blastColor = didClearBlock ? 0xf43f5e : 0x22d3ee;
      const outer = scene.add
        .rectangle(world.x, world.y, CELL_SIZE - 3, CELL_SIZE - 3, blastColor, 0.82)
        .setDepth(30)
        .setBlendMode(Phaser.BlendModes.ADD);
      const core = scene.add
        .rectangle(world.x, world.y, CELL_SIZE - 18, CELL_SIZE - 18, 0xf59e0b, 0.96)
        .setDepth(31)
        .setBlendMode(Phaser.BlendModes.ADD);
      const spark = scene.add
        .image(world.x, world.y, "spark")
        .setAlpha(0.9)
        .setDepth(32)
        .setBlendMode(Phaser.BlendModes.ADD);

      scene.tweens.add({
        targets: [outer, core],
        alpha: 0,
        scale: 1.3,
        duration: 460,
        ease: "Cubic.easeOut",
        onComplete: () => {
          outer.destroy();
          core.destroy();
        }
      });

      scene.tweens.add({
        targets: spark,
        angle: 180,
        alpha: 0,
        scale: 2.1,
        duration: 420,
        ease: "Cubic.easeOut",
        onComplete: () => spark.destroy()
      });
    });
  });

  scene.cameras.main.shake(180, 0.008);
}
