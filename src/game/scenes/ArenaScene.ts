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
import { resolveBlast, tileListIncludes, type BlastResult } from "../simulation/blast";
import {
  chooseBotMove,
  findSafeEscapeMove,
  isDangerTile,
  manhattanDistance
} from "../simulation/danger";
import {
  applyPowerup,
  choosePowerupDrop,
  createInitialLoadout,
  type PlayerLoadout,
  type PowerupType
} from "../simulation/powerups";

const BOT_BLAST_RANGE = 2;
const PLAYER_FUSE_MS = 1400;
const BOT_FUSE_MS = 1800;
const BOT_MOVE_MS = 520;
const COUNTDOWN_LABELS = ["3", "2", "1", "Fuse!"];

type ActiveBomb = {
  owner: "player" | "bot";
  tile: GridPoint;
  range: number;
  sprite: Phaser.GameObjects.Image;
  timer: Phaser.Time.TimerEvent;
};

type BotOpponent = {
  tile: GridPoint;
  sprite: Phaser.GameObjects.Image;
  alive: boolean;
};

type ActivePowerup = {
  tile: GridPoint;
  type: PowerupType;
  sprite: Phaser.GameObjects.Image;
};

type RoundWinner = "player" | "bot" | "draw";

export class ArenaScene extends Phaser.Scene {
  private arena = createInitialArena();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private player?: Phaser.GameObjects.Image;
  private playerTile: GridPoint = { x: 1, y: 1 };
  private playerAlive = true;
  private playerLoadout: PlayerLoadout = createInitialLoadout();
  private bot?: BotOpponent;
  private botMoveEvent?: Phaser.Time.TimerEvent;
  private countdownEvents: Phaser.Time.TimerEvent[] = [];
  private activeBombs: ActiveBomb[] = [];
  private activePowerups = new Map<string, ActivePowerup>();
  private shellEvents?: GameEvents;
  private boardOrigin = { x: 0, y: 0 };
  private boardLayer?: Phaser.GameObjects.Container;
  private blockLayer?: Phaser.GameObjects.Container;
  private fxLayer?: Phaser.GameObjects.Container;
  private blockSprites = new Map<string, Phaser.GameObjects.Image>();
  private roundOver = false;
  private roundActive = false;
  private matchStartedAt = 0;
  private wins = 0;
  private losses = 0;
  private blocksCleared = 0;

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
    this.spawnBot();
    this.startRoundCountdown();
    this.emitLoadout();
    this.shellEvents?.onMatchStatsChange?.({ wins: this.wins, losses: this.losses });

    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
    });
  }

  update() {
    if (!this.player || !this.cursors || !this.wasd) {
      return;
    }

    if (this.roundOver || !this.roundActive) {
      if (Phaser.Input.Keyboard.JustDown(this.wasd.R)) {
        this.resetRound();
      }

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
    this.collectPowerupAt(nextTile);

    this.tweens.add({
      targets: this.player,
      x: world.x,
      y: world.y,
      duration: this.getPlayerMoveDuration(),
      ease: "Quad.easeOut"
    });
  }

  private plantBomb() {
    if (
      this.activeBombCount("player") >= this.playerLoadout.bombs ||
      this.roundOver ||
      !this.roundActive ||
      !this.playerAlive
    ) {
      return;
    }

    this.plantBombAt("player", { ...this.playerTile }, this.playerLoadout.blast, PLAYER_FUSE_MS);
    this.shellEvents?.onRoundStatusChange?.("Fuse");
  }

  private plantBombAt(
    owner: ActiveBomb["owner"],
    tile: GridPoint,
    range: number,
    fuseMs: number
  ) {
    const world = this.tileToWorld(tile);
    const sprite = this.add.image(world.x, world.y, owner === "bot" ? "bot-bomb-core" : "bomb-core");
    sprite.setDepth(12);
    this.tweens.add({
      targets: sprite,
      scale: { from: 0.92, to: 1.08 },
      yoyo: true,
      repeat: -1,
      duration: 280,
      ease: "Sine.easeInOut"
    });

    const bomb: ActiveBomb = {
      owner,
      tile,
      range,
      sprite,
      timer: this.time.delayedCall(fuseMs, () => this.detonateBomb(bomb))
    };

    this.activeBombs.push(bomb);
    return bomb;
  }

  private detonateBomb(bomb: ActiveBomb) {
    if (!this.activeBombs.includes(bomb)) {
      return;
    }

    this.activeBombs = this.activeBombs.filter((activeBomb) => activeBomb !== bomb);
    bomb.sprite.destroy();
    bomb.timer.destroy();
    this.shellEvents?.onRoundStatusChange?.("Blast");

    const blast = resolveBlast(this.arena, bomb.tile, bomb.range);
    this.blocksCleared += blast.clearedBlocks.length;
    this.playExplosion(blast);
    this.time.delayedCall(220, () => {
      this.clearDestroyedBlocks(blast.clearedBlocks);
      this.spawnPowerups(blast.clearedBlocks);
    });
    this.time.delayedCall(140, () => this.evaluateBlastHits(blast));

    this.cameras.main.shake(180, 0.008);
    this.time.delayedCall(720, () => {
      if (!this.roundOver && this.activeBombs.length === 0) {
        this.shellEvents?.onRoundStatusChange?.("Live");
      }
    });
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

  private spawnPowerups(blocks: GridPoint[]) {
    blocks.forEach((blockTile) => {
      const powerup = choosePowerupDrop(
        blockTile,
        this.shellEvents?.getPowerupDropRates?.()
      );

      if (!powerup) {
        return;
      }

      const key = this.tileKey(blockTile);

      if (this.activePowerups.has(key)) {
        return;
      }

      const world = this.tileToWorld(blockTile);
      const sprite = this.add.image(world.x, world.y, this.getPowerupTexture(powerup));
      sprite.setDepth(8);
      this.tweens.add({
        targets: sprite,
        y: world.y - 5,
        yoyo: true,
        repeat: -1,
        duration: 640,
        ease: "Sine.easeInOut"
      });

      this.activePowerups.set(key, {
        tile: blockTile,
        type: powerup,
        sprite
      });
    });
  }

  private collectPowerupAt(tile: GridPoint) {
    const key = this.tileKey(tile);
    const powerup = this.activePowerups.get(key);

    if (!powerup) {
      return;
    }

    this.playerLoadout = applyPowerup(this.playerLoadout, powerup.type);
    this.emitLoadout();
    powerup.sprite.destroy();
    this.activePowerups.delete(key);
  }

  private evaluateBlastHits(blast: BlastResult) {
    if (this.roundOver) {
      return;
    }

    const playerHit = this.playerAlive && tileListIncludes(blast.tiles, this.playerTile);
    const botHit = Boolean(this.bot?.alive && tileListIncludes(blast.tiles, this.bot.tile));

    if (playerHit) {
      this.playerAlive = false;
      this.player?.setTint(0xf59e0b);
      this.tweens.add({
        targets: this.player,
        alpha: 0.25,
        scale: 0.7,
        duration: 220,
        ease: "Cubic.easeOut"
      });
    }

    if (botHit && this.bot) {
      this.bot.alive = false;
      this.bot.sprite.setTint(0xf59e0b);
      this.tweens.add({
        targets: this.bot.sprite,
        alpha: 0.2,
        scale: 0.7,
        duration: 220,
        ease: "Cubic.easeOut"
      });
    }

    if (playerHit && botHit) {
      this.completeRound("draw");
    } else if (botHit) {
      this.completeRound("player");
    } else if (playerHit) {
      this.completeRound("bot");
    }
  }

  private completeRound(winner: RoundWinner) {
    if (this.roundOver) {
      return;
    }

    this.roundOver = true;
    this.roundActive = false;
    this.botMoveEvent?.remove(false);

    if (winner === "player") {
      this.wins += 1;
      this.shellEvents?.onRoundStatusChange?.("Win");
    } else if (winner === "bot") {
      this.losses += 1;
      this.shellEvents?.onRoundStatusChange?.("Down");
    } else {
      this.shellEvents?.onRoundStatusChange?.("Draw");
    }

    this.shellEvents?.onMatchStatsChange?.({ wins: this.wins, losses: this.losses });
    void this.recordMatch(winner);
  }

  private async recordMatch(winner: RoundWinner) {
    try {
      await fetch("/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          winner,
          durationMs: Math.round(this.time.now - this.matchStartedAt),
          blocksCleared: this.blocksCleared
        })
      });
    } catch {
      // Match history should never interrupt active play.
    }
  }

  private spawnPlayer() {
    const world = this.tileToWorld(this.playerTile);
    this.player = this.add.image(world.x, world.y, "player-core").setDepth(5);
    this.fxLayer?.add(this.player);
  }

  private spawnBot() {
    const tile = { x: ARENA_COLS - 2, y: ARENA_ROWS - 2 };
    const world = this.tileToWorld(tile);
    const sprite = this.add.image(world.x, world.y, "bot-core").setDepth(11);

    this.bot = {
      tile,
      sprite,
      alive: true
    };
  }

  private startBotAi() {
    this.botMoveEvent?.remove(false);
    this.botMoveEvent = this.time.addEvent({
      delay: BOT_MOVE_MS,
      loop: true,
      callback: () => this.moveBot()
    });
  }

  private moveBot() {
    if (!this.bot?.alive || this.roundOver || !this.roundActive) {
      return;
    }

    this.maybePlantBotBomb();

    const bombThreats = this.getBombThreats();
    const nextTile = chooseBotMove({
      arena: this.arena,
      from: this.bot.tile,
      target: this.playerTile,
      bombs: bombThreats,
      blockedTiles: this.activeBombs.map((bomb) => bomb.tile)
    });

    if (nextTile.x === this.bot.tile.x && nextTile.y === this.bot.tile.y) {
      return;
    }

    this.bot.tile = nextTile;
    const world = this.tileToWorld(nextTile);

    this.tweens.add({
      targets: this.bot.sprite,
      x: world.x,
      y: world.y,
      duration: 160,
      ease: "Quad.easeOut"
    });
  }

  private handleResize() {
    this.drawArena();

    if (this.player) {
      const world = this.tileToWorld(this.playerTile);
      this.player.setPosition(world.x, world.y);
    }

    this.activeBombs.forEach((bomb) => {
      const world = this.tileToWorld(bomb.tile);
      bomb.sprite.setPosition(world.x, world.y);
    });

    this.activePowerups.forEach((powerup) => {
      const world = this.tileToWorld(powerup.tile);
      powerup.sprite.setPosition(world.x, world.y);
    });

    if (this.bot) {
      const world = this.tileToWorld(this.bot.tile);
      this.bot.sprite.setPosition(world.x, world.y);
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
    return this.activeBombs.some((bomb) => bomb.tile.x === tile.x && bomb.tile.y === tile.y);
  }

  private resetRound() {
    this.botMoveEvent?.remove(false);
    this.clearCountdownEvents();
    this.activeBombs.forEach((bomb) => {
      bomb.timer.destroy();
      bomb.sprite.destroy();
    });
    this.activeBombs = [];
    this.activePowerups.forEach((powerup) => powerup.sprite.destroy());
    this.activePowerups.clear();
    this.player?.destroy();
    this.bot?.sprite.destroy();
    this.bot = undefined;
    this.arena = createInitialArena();
    this.playerTile = { x: 1, y: 1 };
    this.playerAlive = true;
    this.roundOver = false;
    this.roundActive = false;
    this.playerLoadout = createInitialLoadout();
    this.blocksCleared = 0;
    this.fxLayer?.removeAll(true);
    this.drawArena();
    this.spawnPlayer();
    this.spawnBot();
    this.emitLoadout();
    this.startRoundCountdown();
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

  private hasActiveBomb(owner: ActiveBomb["owner"]) {
    return this.activeBombs.some((bomb) => bomb.owner === owner);
  }

  private activeBombCount(owner: ActiveBomb["owner"]) {
    return this.activeBombs.filter((bomb) => bomb.owner === owner).length;
  }

  private maybePlantBotBomb() {
    if (!this.bot?.alive || this.hasActiveBomb("bot") || this.roundOver) {
      return;
    }

    const bombThreats = this.getBombThreats();

    if (isDangerTile(this.arena, bombThreats, this.bot.tile)) {
      return;
    }

    const nearPlayer = manhattanDistance(this.bot.tile, this.playerTile) <= 2;
    const nearSoftBlock = this.hasAdjacentSoftBlock(this.bot.tile);
    const shouldBomb = nearPlayer || (nearSoftBlock && Phaser.Math.Between(0, 100) < 42);

    if (!shouldBomb) {
      return;
    }

    const escapeMove = findSafeEscapeMove({
      arena: this.arena,
      from: this.bot.tile,
      bombs: [
        ...bombThreats,
        {
          tile: this.bot.tile,
          range: BOT_BLAST_RANGE
        }
      ],
      blockedTiles: [...this.activeBombs.map((bomb) => bomb.tile), this.bot.tile]
    });

    if (!escapeMove) {
      return;
    }

    this.plantBombAt("bot", { ...this.bot.tile }, BOT_BLAST_RANGE, BOT_FUSE_MS);
    this.shellEvents?.onRoundStatusChange?.("Danger");
  }

  private hasAdjacentSoftBlock(tile: GridPoint) {
    return [
      { x: tile.x + 1, y: tile.y },
      { x: tile.x - 1, y: tile.y },
      { x: tile.x, y: tile.y + 1 },
      { x: tile.x, y: tile.y - 1 }
    ].some((neighbor) => this.arena[neighbor.y]?.[neighbor.x] === "soft");
  }

  private getBombThreats() {
    return this.activeBombs.map((bomb) => ({
      tile: bomb.tile,
      range: bomb.range
    }));
  }

  private startRoundCountdown() {
    this.roundActive = false;
    this.botMoveEvent?.remove(false);
    this.clearCountdownEvents();

    COUNTDOWN_LABELS.forEach((label, index) => {
      const event = this.time.delayedCall(index * 650, () => {
        if (this.roundOver) {
          return;
        }

        this.shellEvents?.onRoundStatusChange?.(label);
      });

      this.countdownEvents.push(event);
    });

    const startEvent = this.time.delayedCall(COUNTDOWN_LABELS.length * 650, () => {
      if (this.roundOver) {
        return;
      }

      this.roundActive = true;
      this.matchStartedAt = this.time.now;
      this.shellEvents?.onRoundStatusChange?.("Live");
      this.startBotAi();
    });

    this.countdownEvents.push(startEvent);
  }

  private emitLoadout() {
    this.shellEvents?.onLoadoutChange?.(this.playerLoadout);
  }

  private getPlayerMoveDuration() {
    return Math.max(54, 104 - this.playerLoadout.speed * 14);
  }

  private getPowerupTexture(powerup: PowerupType) {
    return `powerup-${powerup}`;
  }

  private clearCountdownEvents() {
    this.countdownEvents.forEach((event) => event.remove(false));
    this.countdownEvents = [];
  }
}
