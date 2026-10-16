import * as Phaser from "phaser";
import type { RoomSnapshot } from "../multiplayer/protocol";
import { BombView, DangerOverlay, drawArenaBlocks, drawArenaFloor } from "../presentation/arenaViews";
import { playExplosionEffect } from "../presentation/explosionEffect";
import { FusebotView, rowDepth } from "../presentation/fusebotView";
import { getDangerTiles } from "../simulation/danger";
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
  private blocks = new Map<string, Phaser.GameObjects.Image>();
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private fighters = new Map<number, { view: FusebotView; tile: string }>();
  private bombs = new Map<number, BombView>();
  private danger?: DangerOverlay;
  private dangerKey = "";
  private seenExplosions = new Set<number>();
  private arenaKey = "";
  private roundId = "";
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private lastStep = -Infinity;
  constructor(private readonly view: DuelView) { super("ArenaScene"); }

  create() {
    this.board = this.add.container(0, 0).setDepth(0);
    drawArenaFloor(this, this.board, 0, 0);
    this.danger = new DangerOverlay(this);
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
      this.blocks.forEach((block) => block.destroy());
      this.blocks = drawArenaBlocks(this, arena, (tile) => this.world(tile));
    }
    if (snapshot?.roundId !== this.roundId) {
      this.sprites.forEach((sprite) => sprite.destroy()); this.sprites.clear();
      this.fighters.forEach((fighter) => fighter.view.destroy()); this.fighters.clear();
      this.bombs.forEach((bomb) => bomb.destroy()); this.bombs.clear();
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
    snapshot?.duel?.players.forEach((player, index) => this.renderFighter(index, player.tile, player.alive, index === snapshot.seat));
    const liveBombs = new Set<number>();
    snapshot?.duel?.bombs.forEach((bomb) => {
      liveBombs.add(bomb.id);
      if (!this.bombs.has(bomb.id)) {
        const world = this.world(bomb.tile);
        this.bombs.set(bomb.id, new BombView(this, world.x, world.y, bomb.tile.y, bomb.owner === snapshot.seat));
      }
    });
    for (const [id, bomb] of this.bombs) if (!liveBombs.has(id)) { bomb.destroy(); this.bombs.delete(id); }
    const threats = snapshot?.duel?.bombs.map((bomb) => ({ tile: bomb.tile, range: bomb.range })) ?? [];
    const dangerKey = `${arenaKey}|${JSON.stringify(threats)}`;
    if (dangerKey !== this.dangerKey) {
      this.dangerKey = dangerKey;
      this.danger?.update(getDangerTiles(arena, threats), (tile) => this.world(tile));
    }
    snapshot?.duel?.powerups.forEach((powerup) => render(`pickup-${powerup.tile.x}-${powerup.tile.y}`, powerup.tile, `powerup-${powerup.type}`, rowDepth(powerup.tile.y, "actor") - 0.6));
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
  private renderFighter(seat: number, tile: GridPoint, alive: boolean, isLocal: boolean) {
    const world = this.world(tile);
    const tileKey = `${tile.x},${tile.y}`;
    let fighter = this.fighters.get(seat);
    if (!fighter) {
      // Seat 0 wears Spark's colors and seat 1 wears Fuse Rush's; your own fighter gets the YOU marker.
      const view = new FusebotView(this, seat === 0 ? "spark" : "fuse-rush", world.x, world.y, { marker: isLocal ? "YOU" : undefined, row: tile.y });
      fighter = { view, tile: tileKey };
      this.fighters.set(seat, fighter);
    } else if (fighter.tile !== tileKey) {
      const [fromX, fromY] = fighter.tile.split(",").map(Number);
      const direction = tile.x < fromX ? "left" : tile.x > fromX ? "right" : tile.y < fromY ? "up" : "down";
      fighter.view.moveTo(world.x, world.y, 90, fromY, tile.y, direction);
      fighter.tile = tileKey;
    }
    fighter.view.setAlive(alive);
  }
  private world(tile: GridPoint) { return { x: (tile.x + 0.5) * CELL_SIZE, y: (tile.y + 0.5) * CELL_SIZE }; }
}
