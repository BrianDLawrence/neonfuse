import * as Phaser from "phaser";
import type { Direction } from "../simulation/arena";
import { FUSEBOT_SPARK_POINTS, fusebotAccent, type FusebotId } from "./fusebotArt";
import {
  FUSEBOT_ORIGIN_Y,
  FUSEBOT_SIZE,
  fusebotGroundKey,
  fusebotTextureKey
} from "./overdriveTextures";

/** Feet sit a little below the tile center so the head reads above it. */
const FEET_OFFSET_Y = 13;
const ACTOR_DEPTH_BASE = 11;

/** Row-sorted depth shared by blocks (even) and actors/bombs (odd) for 2.5D overlap. */
export function rowDepth(row: number, layer: "block" | "actor") {
  return (layer === "block" ? 10 : ACTOR_DEPTH_BASE) + row * 2;
}

type FusebotViewOptions = {
  /** Shows the floating marker and the brighter ground ring. */
  marker?: "P1" | "YOU";
  row: number;
};

/**
 * One Fusebot on the board. Purely cosmetic: callers still own the tile, and
 * this view only animates toward the world positions it is given.
 *
 * Structure: root (position, depth) > rig (hop, squash, lean) > body (idle bob).
 */
export class FusebotView {
  readonly root: Phaser.GameObjects.Container;
  private readonly rig: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly ground: Phaser.GameObjects.Image;
  private readonly light: Phaser.GameObjects.Image;
  private readonly sparks: Phaser.GameObjects.Image[] = [];
  private readonly marker?: Phaser.GameObjects.Image;
  private readonly blinkEvent: Phaser.Time.TimerEvent;
  private facingLeft = false;
  private knockedOut = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly id: FusebotId,
    x: number,
    y: number,
    { marker, row }: FusebotViewOptions
  ) {
    const accent = fusebotAccent(id);
    const u = FUSEBOT_SIZE / 100;

    this.light = scene.add
      .image(0, FEET_OFFSET_Y - 4, "glow")
      .setTint(accent)
      .setAlpha(0.32)
      .setScale(1.2, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.ground = scene.add.image(0, FEET_OFFSET_Y, fusebotGroundKey(id, Boolean(marker)));
    this.body = scene.add.image(0, 0, fusebotTextureKey(id)).setOrigin(0.5, FUSEBOT_ORIGIN_Y);
    // The rig pivots at the feet so squash, lean and hop read as weight.
    this.rig = scene.add.container(0, FEET_OFFSET_Y, [this.body]);

    FUSEBOT_SPARK_POINTS[id].forEach((point) => {
      const spark = scene.add
        .image(point.x * u, point.y * u, "glow")
        .setTint(point.color)
        .setScale(0.16)
        .setAlpha(0.85)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.sparks.push(spark);
      this.rig.add(spark);
    });

    const children: Phaser.GameObjects.GameObject[] = [this.light, this.ground, this.rig];

    if (marker) {
      this.marker = scene.add.image(0, FEET_OFFSET_Y - FUSEBOT_SIZE * 1.42, `marker-${marker.toLowerCase()}`);
      children.push(this.marker);
      scene.tweens.add({
        targets: this.marker,
        y: this.marker.y - 3,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut"
      });
    }

    this.root = scene.add.container(x, y, children).setDepth(rowDepth(row, "actor"));

    const phase = Phaser.Math.Between(0, 400);
    scene.tweens.add({
      targets: this.body,
      y: -2,
      scaleY: 1.02,
      duration: 380,
      delay: phase,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });

    if (this.sparks.length > 0) {
      scene.tweens.add({
        targets: this.sparks,
        scale: { from: 0.13, to: 0.2 },
        alpha: { from: 0.65, to: 1 },
        duration: 70,
        yoyo: true,
        repeat: -1
      });
    }

    this.blinkEvent = scene.time.addEvent({
      delay: Phaser.Math.Between(2200, 3800),
      loop: true,
      callback: () => this.blink()
    });
  }

  get x() {
    return this.root.x;
  }

  get y() {
    return this.root.y;
  }

  setPosition(x: number, y: number, row: number) {
    this.scene.tweens.killTweensOf(this.root);
    this.root.setPosition(x, y).setDepth(rowDepth(row, "actor"));
  }

  /** Step to an adjacent tile with a hop, squash-and-stretch and a lean into the move. */
  moveTo(x: number, y: number, durationMs: number, fromRow: number, toRow: number, direction?: Direction) {
    if (this.knockedOut) {
      return;
    }

    if (direction) {
      this.face(direction);
    }

    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.killTweensOf(this.rig);
    this.rig.setPosition(0, FEET_OFFSET_Y);
    this.root.setDepth(rowDepth(Math.max(fromRow, toRow), "actor"));
    this.scene.tweens.add({
      targets: this.root,
      x,
      y,
      duration: durationMs,
      ease: "Quad.easeOut",
      onComplete: () => this.root.setDepth(rowDepth(toRow, "actor"))
    });

    const lean = direction === "left" ? -7 : direction === "right" ? 7 : 0;
    this.rig.setScale(1.08, 0.9).setAngle(lean);
    this.scene.tweens.add({
      targets: this.rig,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      duration: Math.max(140, durationMs * 1.6),
      ease: "Back.easeOut"
    });
    this.scene.tweens.add({
      targets: this.rig,
      y: FEET_OFFSET_Y - 4,
      duration: Math.max(45, durationMs / 2),
      yoyo: true,
      ease: "Sine.easeOut"
    });
  }

  /** A blocked move: nudge toward the wall and spring back. */
  bump(dx: number, dy: number) {
    if (this.knockedOut) {
      return;
    }

    if (dx !== 0) {
      this.face(dx < 0 ? "left" : "right");
    }

    this.scene.tweens.add({
      targets: this.rig,
      x: dx * 5,
      y: FEET_OFFSET_Y + dy * 5,
      duration: 45,
      yoyo: true,
      onComplete: () => this.rig.setPosition(0, FEET_OFFSET_Y)
    });
  }

  /** Crouch while planting a bomb. */
  plant() {
    if (this.knockedOut) {
      return;
    }

    this.scene.tweens.add({
      targets: this.rig,
      scaleX: 1.12,
      scaleY: 0.82,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut"
    });
  }

  /** Flash, pop into sparks of the character's color, and leave a dim ghost behind. */
  knockout() {
    if (this.knockedOut) {
      return;
    }

    this.knockedOut = true;
    const accent = fusebotAccent(this.id);
    this.scene.tweens.killTweensOf(this.rig);
    this.rig.setPosition(0, FEET_OFFSET_Y);
    this.body.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.body.setTint(0x64748b));

    const burst = this.scene.add.particles(this.root.x, this.root.y - FUSEBOT_SIZE * 0.4, "spark", {
      speed: { min: 60, max: 210 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: { min: 280, max: 620 },
      gravityY: 260,
      tint: [accent, 0xffffff, 0xf59e0b],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false
    });
    burst.setDepth(this.root.depth + 1);
    burst.explode(26);
    this.scene.time.delayedCall(700, () => burst.destroy());

    this.scene.tweens.add({
      targets: this.rig,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 90,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.rig,
          scaleX: 0.78,
          scaleY: 0.7,
          angle: this.facingLeft ? -14 : 14,
          alpha: 0.28,
          duration: 260,
          ease: "Cubic.easeOut"
        });
      }
    });
    const fading: Phaser.GameObjects.Image[] = [this.ground, this.light];
    if (this.marker) {
      fading.push(this.marker);
    }
    this.scene.tweens.add({ targets: fading, alpha: 0.12, duration: 300 });
    this.sparks.forEach((spark) => spark.setVisible(false));
  }

  /** Duel snapshots can report a fighter as down without a local blast hit. */
  setAlive(alive: boolean) {
    if (!alive) {
      this.knockout();
    }
  }

  destroy() {
    this.blinkEvent.remove(false);
    [this.root, this.rig, this.body, this.marker, ...this.sparks].forEach((target) => {
      if (target) {
        this.scene.tweens.killTweensOf(target);
      }
    });
    this.root.destroy(true);
  }

  private face(direction: Direction) {
    if (direction === "left" || direction === "right") {
      this.facingLeft = direction === "left";
      this.body.setFlipX(this.facingLeft);
      const u = FUSEBOT_SIZE / 100;
      FUSEBOT_SPARK_POINTS[this.id].forEach((point, index) => {
        this.sparks[index]?.setX((this.facingLeft ? -point.x : point.x) * u);
      });
    }
  }

  private blink() {
    if (this.knockedOut || !this.body.active) {
      return;
    }

    this.body.setTexture(fusebotTextureKey(this.id, true));
    this.scene.time.delayedCall(110, () => {
      if (this.body.active) {
        this.body.setTexture(fusebotTextureKey(this.id));
      }
    });
  }
}
