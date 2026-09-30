import * as Phaser from "phaser";
import type { RoomSnapshot } from "../multiplayer/protocol";
import { playExplosionEffect } from "../presentation/explosionEffect";
import type { DuelCommand } from "../simulation/duel";
import { ARENA_COLS, ARENA_ROWS, CELL_SIZE, createInitialArena, type Direction, type GridPoint } from "../simulation/arena";
import { computeArenaBoardFit } from "../simulation/layout";

export type DuelView = {
  snapshot: () => RoomSnapshot | null;
  direction: () => Direction | null;
  input: (command: DuelCommand) => void;
  touchControlsVisible: () => boolean;
  loaded: () => void;
};

/** Presentation and input only. All gameplay decisions arrive from the server. */
export class DuelScene extends Phaser.Scene {
  private board?: Phaser.GameObjects.Container;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private seenExplosions = new Set<number>();
  private arenaKey = "";
  private roundId = "";
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private lastStep = -Infinity;
  constructor(private readonly view: DuelView) { super("ArenaScene"); }

  create() {
    this.board = this.add.container(0, 0);
    this.keys = this.input.keyboard?.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE", false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.scale.on("resize", this.fit, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", this.fit, this));
    this.fit();
    this.view.loaded();
  }

  private fit() {
    const width = ARENA_COLS * CELL_SIZE;
    const height = ARENA_ROWS * CELL_SIZE;
    const fit = computeArenaBoardFit(this.scale.width, this.scale.height, width, height, {
      touchControlsVisible: this.view.touchControlsVisible()
    });
    const camera = this.cameras.main;
    camera.setZoom(fit.zoom);

    if (
      fit.zoom >= 1 &&
      fit.reservedSides === 0 &&
      fit.reservedTop + fit.reservedBottom === 0
    ) {
      camera.centerOn(width / 2, height / 2 - 22);
      return;
    }

    const verticalNudge = (fit.reservedBottom - fit.reservedTop) / (2 * fit.zoom);
    camera.centerOn(width / 2, height / 2 + verticalNudge);
  }

  update(time: number) {
    const snapshot = this.view.snapshot();
    const arena = snapshot?.duel?.arena ?? createInitialArena();
    const arenaKey = JSON.stringify(arena);
    if (arenaKey !== this.arenaKey) {
      this.arenaKey = arenaKey;
      this.board?.removeAll(true);
      arena.forEach((row, y) => row.forEach((cell, x) => {
        const point = this.world({ x, y });
        const floor = this.add.rectangle(point.x, point.y, CELL_SIZE - 3, CELL_SIZE - 3, 0x0f172a).setStrokeStyle(1, 0x22d3ee, 0.14);
        this.board?.add(floor);
        if (cell !== "floor") this.board?.add(this.add.image(point.x, point.y, cell === "hard" ? "hard-block" : "soft-block"));
      }));
    }
    if (snapshot?.roundId !== this.roundId) {
      this.sprites.forEach((sprite) => sprite.destroy()); this.sprites.clear();
      this.seenExplosions.clear();
      this.roundId = snapshot?.roundId ?? "";
    }
    const wanted = new Set<string>();
    const render = (key: string, tile: GridPoint, texture: string, depth: number, alive = true) => {
      wanted.add(key);
      const world = this.world(tile);
      let sprite = this.sprites.get(key);
      if (!sprite) {
        sprite = this.add.image(world.x, world.y, texture).setDepth(depth);
        this.sprites.set(key, sprite);
      } else if (sprite.getData("tile") !== `${tile.x},${tile.y}`) {
        this.tweens.killTweensOf(sprite);
        this.tweens.add({ targets: sprite, x: world.x, y: world.y, duration: 90 });
      }
      sprite.setData("tile", `${tile.x},${tile.y}`);
      sprite.setAlpha(alive ? 1 : 0.25);
    };
    snapshot?.duel?.players.forEach((player, index) => render(`player-${index}`, player.tile, index === 0 ? "player-core" : "bot-core", 10, player.alive));
    snapshot?.duel?.bombs.forEach((bomb) => render(`bomb-${bomb.id}`, bomb.tile, bomb.owner === 0 ? "bomb-core" : "bot-bomb-core", 8));
    snapshot?.duel?.powerups.forEach((powerup) => render(`pickup-${powerup.tile.x}-${powerup.tile.y}`, powerup.tile, `powerup-${powerup.type}`, 5));
    for (const [key, sprite] of this.sprites) if (!wanted.has(key)) { sprite.destroy(); this.sprites.delete(key); }
    const explosions = snapshot?.duel?.explosions ?? [];
    for (const blast of explosions) {
      if (this.seenExplosions.has(blast.id)) continue;
      this.seenExplosions.add(blast.id);
      playExplosionEffect(this, blast, (tile) => this.world(tile));
    }
    if (snapshot?.phase !== "playing" || !this.keys) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(focused.tagName)) return;
    let direction = this.view.direction();
    for (const [name, value] of [["W", "up"], ["UP", "up"], ["S", "down"], ["DOWN", "down"], ["A", "left"], ["LEFT", "left"], ["D", "right"], ["RIGHT", "right"]] as const) {
      if (this.keys[name].isDown) direction = value;
    }
    const cadence = 145 - ((snapshot.duel?.players[snapshot.seat].loadout.speed ?? 1) - 1) * 20;
    if (direction && time - this.lastStep >= cadence) {
      this.view.input({ type: "move", direction }); this.lastStep = time;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.view.input({ type: "bomb" });
  }
  private world(tile: GridPoint) { return { x: (tile.x + 0.5) * CELL_SIZE, y: (tile.y + 0.5) * CELL_SIZE }; }
}
