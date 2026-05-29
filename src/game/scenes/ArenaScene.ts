import * as Phaser from "phaser";
import type { GameEvents } from "../createGame";
import {
  ARENA_COLS,
  ARENA_ROWS,
  CELL_SIZE,
  createInitialArena,
  type GridPoint,
  isWalkable
} from "../simulation/arena";

type ActiveBomb = {
  tile: GridPoint;
  sprite: Phaser.GameObjects.Image;
  timer: Phaser.Time.TimerEvent;
};

type BlastResult = {
  tiles: GridPoint[];
  clearedBlocks: GridPoint[];
};

export class ArenaScene extends Phaser.Scene {
  private arena = createInitialArena();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private player?: Phaser.GameObjects.Image;
  private playerTile: GridPoint = { x: 1, y: 1 };
  private activeBomb?: ActiveBomb;
  private shellEvents?: GameEvents;
  private boardOrigin = { x: 0, y: 0 };
  private boardLayer?: Phaser.GameObjects.Container;
  private blockLayer?: Phaser.GameObjects.Container;
  private fxLayer?: Phaser.GameObjects.Container;
  private blockSprites = new Map<string, Phaser.GameObjects.Image>();

  constructor() {
    super("ArenaScene");
  }

  create() {
    this.shellEvents = this.registry.get("events") as GameEvents | undefined;
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D,SPACE,R") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.boardLayer = this.add.container(0, 0).setDepth(0);
    this.blockLayer = this.add.container(0, 0).setDepth(1);
    this.fxLayer = this.add.container(0, 0).setDepth(2);

    this.drawArena();
    this.spawnPlayer();
    this.shellEvents?.onRoundStatusChange?.("Live");
    this.shellEvents?.onLoadoutChange?.({ bombs: 1, blast: 2 });

    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
    });
  }

  update() {
    if (!this.player || !this.cursors || !this.wasd) {
      return;
    }

    const move = this.getMoveIntent();

    if (move) {
      this.tryMove(move);
    }

    if (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE)) {
      this.plantBomb();
    }

    if (Phaser.Input.Keyboard.JustDown(this.wasd.R)) {
      this.resetRound();
    }
  }

  private getMoveIntent(): GridPoint | null {
    if (!this.cursors || !this.wasd) {
      return null;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.A)) {
      return { x: -1, y: 0 };
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.D)) {
      return { x: 1, y: 0 };
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W)) {
      return { x: 0, y: -1 };
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S)) {
      return { x: 0, y: 1 };
    }

    return null;
  }

  private tryMove(delta: GridPoint) {
    const nextTile = {
      x: this.playerTile.x + delta.x,
      y: this.playerTile.y + delta.y
    };

    if (!isWalkable(this.arena, nextTile) || this.activeBombAt(nextTile)) {
      this.bumpPlayer(delta);
      return;
    }

    this.playerTile = nextTile;
    const world = this.tileToWorld(nextTile);

    this.tweens.add({
      targets: this.player,
      x: world.x,
      y: world.y,
      duration: 90,
      ease: "Quad.easeOut"
    });
  }

  private plantBomb() {
    if (this.activeBomb) {
      return;
    }

    const world = this.tileToWorld(this.playerTile);
    const sprite = this.add.image(world.x, world.y, "bomb-core").setDepth(4);
    sprite.setDepth(12);

    this.tweens.add({
      targets: sprite,
      scale: { from: 0.92, to: 1.08 },
      yoyo: true,
      repeat: -1,
      duration: 280,
      ease: "Sine.easeInOut"
    });

    const tile = { ...this.playerTile };

    this.activeBomb = {
      tile,
      sprite,
      timer: this.time.delayedCall(1400, () => this.detonateBomb(tile))
    };

    this.shellEvents?.onRoundStatusChange?.("Fuse");
  }

  private detonateBomb(tile: GridPoint) {
    if (!this.activeBomb) {
      return;
    }

    this.activeBomb.sprite.destroy();
    this.activeBomb.timer.destroy();
    this.activeBomb = undefined;
    this.shellEvents?.onRoundStatusChange?.("Blast");

    const blast = this.resolveBlast(tile, 2);
    this.playExplosion(blast);
    this.time.delayedCall(220, () => this.clearDestroyedBlocks(blast.clearedBlocks));

    this.cameras.main.shake(180, 0.008);
    this.time.delayedCall(720, () => this.shellEvents?.onRoundStatusChange?.("Live"));
  }

  private resolveBlast(origin: GridPoint, range: number): BlastResult {
    const tiles: GridPoint[] = [origin];
    const clearedBlocks: GridPoint[] = [];
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    directions.forEach((direction) => {
      for (let distance = 1; distance <= range; distance += 1) {
        const tile = {
          x: origin.x + direction.x * distance,
          y: origin.y + direction.y * distance
        };

        const cell = this.arena[tile.y]?.[tile.x];

        if (!cell || cell === "hard") {
          break;
        }

        tiles.push(tile);

        if (cell === "soft") {
          this.arena[tile.y][tile.x] = "floor";
          clearedBlocks.push(tile);
          break;
        }
      }
    });

    return { tiles, clearedBlocks };
  }

  private playExplosion(blast: BlastResult) {
    blast.tiles.forEach((blastTile, index) => {
      this.time.delayedCall(index * 24, () => {
        const didClearBlock = blast.clearedBlocks.some(
          (block) => block.x === blastTile.x && block.y === blastTile.y
        );

        this.flashTile(blastTile, didClearBlock);
      });
    });
  }

  private flashTile(tile: GridPoint, didClearBlock: boolean) {
    const world = this.tileToWorld(tile);
    const blastColor = didClearBlock ? 0xf43f5e : 0x22d3ee;
    const outer = this.add.rectangle(world.x, world.y, CELL_SIZE - 3, CELL_SIZE - 3, blastColor, 0.82);
    const core = this.add.rectangle(world.x, world.y, CELL_SIZE - 18, CELL_SIZE - 18, 0xf59e0b, 0.96);
    const spark = this.add.image(world.x, world.y, "spark").setAlpha(0.9);

    outer.setBlendMode(Phaser.BlendModes.ADD);
    core.setBlendMode(Phaser.BlendModes.ADD);
    spark.setBlendMode(Phaser.BlendModes.ADD);
    outer.setDepth(30);
    core.setDepth(31);
    spark.setDepth(32);

    this.tweens.add({
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

    this.tweens.add({
      targets: spark,
      angle: 180,
      alpha: 0,
      scale: 2.1,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => spark.destroy()
    });
  }

  private drawArena() {
    this.boardLayer?.removeAll(true);

    const boardWidth = ARENA_COLS * CELL_SIZE;
    const boardHeight = ARENA_ROWS * CELL_SIZE;

    this.boardOrigin = {
      x: (this.scale.width - boardWidth) / 2,
      y: (this.scale.height - boardHeight) / 2 + 22
    };

    const glow = this.add.rectangle(
      this.boardOrigin.x + boardWidth / 2,
      this.boardOrigin.y + boardHeight / 2,
      boardWidth + 28,
      boardHeight + 28,
      0x22d3ee,
      0.04
    );
    glow.setStrokeStyle(2, 0x22d3ee, 0.18);
    this.boardLayer?.add(glow);

    for (let y = 0; y < ARENA_ROWS; y += 1) {
      for (let x = 0; x < ARENA_COLS; x += 1) {
        const world = this.tileToWorld({ x, y });
        const tile = this.add.rectangle(world.x, world.y, CELL_SIZE - 3, CELL_SIZE - 3, 0x0f172a, 0.82);
        tile.setStrokeStyle(1, 0x22d3ee, 0.14);
        this.boardLayer?.add(tile);
      }
    }

    this.redrawBlocks();
  }

  private redrawBlocks() {
    this.blockLayer?.removeAll(true);
    this.blockSprites.clear();

    for (let y = 0; y < ARENA_ROWS; y += 1) {
      for (let x = 0; x < ARENA_COLS; x += 1) {
        const cell = this.arena[y][x];

        if (cell !== "hard" && cell !== "soft") {
          continue;
        }

        const world = this.tileToWorld({ x, y });
        const texture = cell === "hard" ? "hard-block" : "soft-block";
        const block = this.add.image(world.x, world.y, texture).setDepth(cell === "hard" ? 2 : 1);
        this.blockLayer?.add(block);
        this.blockSprites.set(this.tileKey({ x, y }), block);
      }
    }
  }

  private clearDestroyedBlocks(blocks: GridPoint[]) {
    blocks.forEach((blockTile) => {
      const key = this.tileKey(blockTile);
      const block = this.blockSprites.get(key);

      if (!block) {
        return;
      }

      this.tweens.add({
        targets: block,
        alpha: 0,
        scale: 1.2,
        duration: 120,
        ease: "Cubic.easeOut",
        onComplete: () => {
          block.destroy();
          this.blockSprites.delete(key);
        }
      });
    });
  }

  private spawnPlayer() {
    const world = this.tileToWorld(this.playerTile);
    this.player = this.add.image(world.x, world.y, "player-core").setDepth(5);
    this.fxLayer?.add(this.player);
  }

  private handleResize() {
    this.drawArena();

    if (this.player) {
      const world = this.tileToWorld(this.playerTile);
      this.player.setPosition(world.x, world.y);
    }

    if (this.activeBomb) {
      const world = this.tileToWorld(this.activeBomb.tile);
      this.activeBomb.sprite.setPosition(world.x, world.y);
    }
  }

  private bumpPlayer(delta: GridPoint) {
    if (!this.player) {
      return;
    }

    this.tweens.add({
      targets: this.player,
      x: this.player.x + delta.x * 5,
      y: this.player.y + delta.y * 5,
      yoyo: true,
      duration: 42
    });
  }

  private activeBombAt(tile: GridPoint) {
    return this.activeBomb?.tile.x === tile.x && this.activeBomb.tile.y === tile.y;
  }

  private resetRound() {
    this.activeBomb?.timer.destroy();
    this.activeBomb?.sprite.destroy();
    this.activeBomb = undefined;
    this.arena = createInitialArena();
    this.playerTile = { x: 1, y: 1 };
    this.fxLayer?.removeAll(true);
    this.drawArena();
    this.spawnPlayer();
    this.shellEvents?.onRoundStatusChange?.("Live");
  }

  private tileToWorld(tile: GridPoint) {
    return {
      x: this.boardOrigin.x + tile.x * CELL_SIZE + CELL_SIZE / 2,
      y: this.boardOrigin.y + tile.y * CELL_SIZE + CELL_SIZE / 2
    };
  }

  private tileKey(tile: GridPoint) {
    return `${tile.x}:${tile.y}`;
  }
}
