import * as Phaser from "phaser";
import { ARENA_COLS, ARENA_ROWS, CELL_SIZE, type ArenaGrid, type GridPoint } from "../simulation/arena";
import { rowDepth } from "./fusebotView";
import { BLOCK_ORIGIN_Y, FLOOR_FRAME, ensureArenaFloorTexture } from "./overdriveTextures";

type ToWorld = (tile: GridPoint) => GridPoint;

const DANGER_DEPTH = 3;

/** Backdrop glow plus the framed floor plate for a board whose top-left corner is (boardLeft, boardTop). */
export function drawArenaFloor(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  boardLeft: number,
  boardTop: number,
  cols = ARENA_COLS,
  rows = ARENA_ROWS
) {
  const width = cols * CELL_SIZE;
  const height = rows * CELL_SIZE;
  const centerX = boardLeft + width / 2;
  const centerY = boardTop + height / 2;

  layer.add(
    scene.add
      .image(centerX, centerY, "arena-backdrop")
      .setDisplaySize(width + 760, height + 560)
      .setBlendMode(Phaser.BlendModes.ADD)
  );
  layer.add(scene.add.image(centerX, centerY, ensureArenaFloorTexture(scene, cols, rows)));

  return { width: width + FLOOR_FRAME * 2, height: height + FLOOR_FRAME * 2 };
}

/** Draws hard walls and crates as row-sorted 2.5D sprites and returns them keyed by `x:y`. */
export function drawArenaBlocks(scene: Phaser.Scene, arena: ArenaGrid, toWorld: ToWorld) {
  const blocks = new Map<string, Phaser.GameObjects.Image>();

  arena.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell !== "hard" && cell !== "soft") {
        return;
      }

      const world = toWorld({ x, y });
      const block = scene.add
        .image(world.x, world.y, cell === "hard" ? "hard-block" : "soft-block")
        .setOrigin(0.5, BLOCK_ORIGIN_Y)
        .setDepth(rowDepth(y, "block"));
      blocks.set(`${x}:${y}`, block);
    })
  );

  return blocks;
}

/** Crate break: a quick pop up, then it collapses as the blast clears it. */
export function shatterBlock(scene: Phaser.Scene, block: Phaser.GameObjects.Image, onComplete: () => void) {
  scene.tweens.add({
    targets: block,
    scaleX: 1.15,
    scaleY: 0.4,
    alpha: 0,
    y: block.y + 6,
    duration: 160,
    ease: "Cubic.easeIn",
    onComplete
  });
}

/** A bomb on the board: glossy shell, colored band, flickering fuse and a light pool. */
export class BombView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly shell: Phaser.GameObjects.Image;
  private readonly light: Phaser.GameObjects.Image;
  private readonly fuse: Phaser.GameObjects.Image;
  private readonly tweens: Phaser.Tweens.Tween[] = [];

  constructor(private readonly scene: Phaser.Scene, x: number, y: number, row: number, isLocal: boolean) {
    this.light = scene.add
      .image(0, 8, "glow")
      .setTint(0xf59e0b)
      .setAlpha(0.35)
      .setScale(0.9, 0.6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.shell = scene.add.image(0, 2, isLocal ? "bomb-core" : "bot-bomb-core").setOrigin(0.5, 0.62);
    this.fuse = scene.add
      .image(13, -17, "glow")
      .setTint(0xf59e0b)
      .setScale(0.18)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root = scene.add.container(x, y, [this.light, this.shell, this.fuse]).setDepth(rowDepth(row, "actor") - 0.5);

    this.root.setScale(0.4);
    scene.tweens.add({ targets: this.root, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.tweens.push(
      scene.tweens.add({
        targets: this.shell,
        scaleX: { from: 0.94, to: 1.06 },
        scaleY: { from: 1.04, to: 0.95 },
        yoyo: true,
        repeat: -1,
        duration: 280,
        ease: "Sine.easeInOut"
      }),
      scene.tweens.add({
        targets: this.fuse,
        scale: { from: 0.14, to: 0.24 },
        alpha: { from: 0.7, to: 1 },
        yoyo: true,
        repeat: -1,
        duration: 60
      }),
      scene.tweens.add({
        targets: this.light,
        alpha: { from: 0.25, to: 0.5 },
        yoyo: true,
        repeat: -1,
        duration: 280
      })
    );
  }

  setPosition(x: number, y: number) {
    this.root.setPosition(x, y);
  }

  /** The last stretch of the fuse: pulse faster so the danger is felt. */
  setUrgent() {
    this.tweens.forEach((tween) => tween.setTimeScale(2.4));
    this.light.setTint(0xfb7185);
  }

  destroy() {
    this.tweens.forEach((tween) => tween.remove());
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy(true);
  }
}

/** Pulsing warning tiles for every cell a live bomb will hit. */
export class DangerOverlay {
  private readonly layer: Phaser.GameObjects.Container;
  private readonly tiles: Phaser.GameObjects.Image[] = [];
  private lastKey = "";

  constructor(scene: Phaser.Scene) {
    this.layer = scene.add.container(0, 0).setDepth(DANGER_DEPTH).setAlpha(0.5);
    scene.tweens.add({
      targets: this.layer,
      alpha: 1,
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
  }

  update(tiles: GridPoint[], toWorld: ToWorld) {
    const key = tiles.map((tile) => `${tile.x}:${tile.y}`).join("|");

    if (key === this.lastKey) {
      return;
    }

    this.lastKey = key;

    while (this.tiles.length < tiles.length) {
      const image = this.layer.scene.add.image(0, 0, "danger-tile");
      this.tiles.push(image);
      this.layer.add(image);
    }

    this.tiles.forEach((image, index) => {
      const tile = tiles[index];
      image.setVisible(Boolean(tile));

      if (tile) {
        const world = toWorld(tile);
        image.setPosition(world.x, world.y);
      }
    });
  }

  clear() {
    this.update([], () => ({ x: 0, y: 0 }));
  }

  destroy() {
    this.layer.scene.tweens.killTweensOf(this.layer);
    this.layer.destroy(true);
  }
}
