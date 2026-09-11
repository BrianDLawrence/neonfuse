import * as Phaser from "phaser";
import type { RoomSnapshot } from "../multiplayer/protocol";
import type { DuelCommand } from "../simulation/duel";
import { ARENA_COLS, ARENA_ROWS, CELL_SIZE, createInitialArena, type Direction, type GridPoint } from "../simulation/arena";

export type DuelView = {
  snapshot: () => RoomSnapshot | null;
  direction: () => Direction | null;
  input: (command: DuelCommand) => void;
  loaded: () => void;
};

/** Presentation and input only. All gameplay decisions arrive from the server. */
export class DuelScene extends Phaser.Scene {
  private board?: Phaser.GameObjects.Container;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private effects = new Map<number, Phaser.GameObjects.Container>();
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
    const mobile = this.scale.width <= 760;
    const short = this.scale.width > this.scale.height && this.scale.height <= 520;
    const top = short ? 90 : mobile ? 164 : 150;
    const bottom = short ? 32 : 188;
    const available = Math.max(100, this.scale.height - top - bottom);
    const zoom = Math.min(1, (this.scale.width - (short ? 310 : 24)) / width, available / height);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(width / 2, height / 2 + (bottom - top) / (2 * zoom));
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
      this.effects.forEach((effect) => effect.destroy()); this.effects.clear();
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
      if (this.effects.has(blast.id)) continue;
      const effect = this.add.container(0, 0).setDepth(20);
      for (const tile of blast.tiles) {
        const world = this.world(tile);
        effect.add(this.add.rectangle(world.x, world.y, CELL_SIZE - 4, CELL_SIZE - 4, 0x22d3ee, 0.75));
        effect.add(this.add.rectangle(world.x, world.y, CELL_SIZE - 20, CELL_SIZE - 20, 0xf59e0b, 0.95));
      }
      this.effects.set(blast.id, effect);
    }
    for (const [id, effect] of this.effects) if (!explosions.some((blast) => blast.id === id)) { effect.destroy(); this.effects.delete(id); }
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
