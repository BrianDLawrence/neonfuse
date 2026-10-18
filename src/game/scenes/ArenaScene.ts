import * as Phaser from "phaser";
import type { AudioDirector, AudioEventName, MusicIntensity } from "@/audio";
import type { GameEvents, TouchControlsLayoutState, TouchInputState } from "../createGame";
import { DEFAULT_GAME_MODE, hasHumanPlayer, type GameMode } from "../modes";
import {
  BombView,
  DangerOverlay,
  drawArenaBlocks,
  drawArenaFloor,
  shatterBlock
} from "../presentation/arenaViews";
import { playExplosionEffect } from "../presentation/explosionEffect";
import { FusebotView, rowDepth } from "../presentation/fusebotView";
import {
  ARENA_COLS,
  ARENA_ROWS,
  CELL_SIZE,
  createArena,
  createInitialArena,
  getSpawnPoints,
  type Direction,
  directionToDelta,
  type GridPoint,
  isWalkable
} from "../simulation/arena";
import { computeArenaBoardFit } from "../simulation/layout";
import { resolveBlast, tileListIncludes, type BlastResult } from "../simulation/blast";
import {
  BOT_PROFILES,
  DEFAULT_BOT_SELECTION,
  chooseBotTurn,
  type BotActorState,
  type BotId,
  type BotPowerupTarget,
  type BotProfile
} from "../simulation/bots";
import {
  DEFAULT_BOT_FUSE_MS,
  getCampaignStage,
  resolveStageBot,
  resolveStageModifiers,
  type CampaignStage
} from "../simulation/campaign";
import { getDangerTiles, type BombThreat } from "../simulation/danger";
import {
  applyPowerup,
  choosePowerupDrop,
  createInitialLoadout,
  type ActorLoadout,
  type PowerupDropRates,
  type PowerupType
} from "../simulation/powerups";
import { resolveRoundWinner } from "../simulation/round";

const PLAYER_FUSE_MS = 1400;
const BOT_AI_TICK_MS = 120;
const BASE_BOT_MOVE_MS = 560;
const BOT_MOVE_JITTER_MS = 90;
const COUNTDOWN_LABELS = ["3", "2", "1", "Fuse!"];
// Auto-repeat cadence for a held touch D-pad direction. Kept just above the
// player move tween so steps don't queue ahead of the animation.
const TOUCH_STEP_MS = 140;

type ActorId = "player" | BotId;

type ActiveBomb = {
  owner: ActorId;
  tile: GridPoint;
  range: number;
  view: BombView;
  timer: Phaser.Time.TimerEvent;
  urgentTimer: Phaser.Time.TimerEvent;
};

type CombatActor = {
  id: ActorId;
  kind: "player" | "bot";
  tile: GridPoint;
  view: FusebotView;
  alive: boolean;
  loadout: ActorLoadout;
  profile?: BotProfile;
  nextMoveAt: number;
  turn: number;
};

type ActivePowerup = {
  tile: GridPoint;
  type: PowerupType;
  sprite: Phaser.GameObjects.Image;
};

type RoundWinner = ActorId | "bot" | "draw";

export class ArenaScene extends Phaser.Scene {
  private arena = createInitialArena();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<string, Phaser.Input.Keyboard.Key>;
  private touchInput?: TouchInputState;
  private touchBombQueued = false;
  private lastTouchStepAt = Number.NEGATIVE_INFINITY;
  private actors = new Map<ActorId, CombatActor>();
  private botMoveEvent?: Phaser.Time.TimerEvent;
  private countdownEvents: Phaser.Time.TimerEvent[] = [];
  private activeBombs: ActiveBomb[] = [];
  private activePowerups = new Map<string, ActivePowerup>();
  private shellEvents?: GameEvents;
  private audio?: AudioDirector;
  private boardOrigin = { x: 0, y: 0 };
  private boardLayer?: Phaser.GameObjects.Container;
  private fxLayer?: Phaser.GameObjects.Container;
  private dangerOverlay?: DangerOverlay;
  private blockSprites = new Map<string, Phaser.GameObjects.Image>();
  private currentMode: GameMode = DEFAULT_GAME_MODE;
  private currentStage: CampaignStage | null = null;
  // Campaign stage modifiers; the defaults reproduce local and skirmish rounds.
  private botFuseMs = DEFAULT_BOT_FUSE_MS;
  private botMoveScale = 1;
  private stageDropRates: PowerupDropRates | null = null;
  private roundOver = false;
  private roundActive = false;
  private matchStartedAt = 0;
  private wins = 0;
  private losses = 0;
  private blocksCleared = 0;
  private roundSeed = 0;

  constructor() {
    super("ArenaScene");
  }

  create() {
    this.shellEvents = this.registry.get("events") as GameEvents | undefined;
    this.audio = this.registry.get("audio") as AudioDirector | undefined;
    this.touchInput = this.registry.get("touchInput") as TouchInputState | undefined;
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys("W,A,S,D,SPACE,R") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.boardLayer = this.add.container(0, 0).setDepth(0);
    this.fxLayer = this.add.container(0, 0).setDepth(2);
    this.dangerOverlay = new DangerOverlay(this);
    this.applyCameraFx();

    this.game.events.on("mode-change", this.handleModeChange, this);
    this.game.events.on("touch-bomb", this.handleTouchBomb, this);
    this.game.events.on("touch-reset", this.resetRound, this);
    this.input.keyboard?.on("keydown", this.unlockAudio, this);
    this.input.on("pointerdown", this.unlockAudio, this);
    this.scale.on("resize", this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off("mode-change", this.handleModeChange, this);
      this.game.events.off("touch-bomb", this.handleTouchBomb, this);
      this.game.events.off("touch-reset", this.resetRound, this);
      this.input.keyboard?.off("keydown", this.unlockAudio, this);
      this.input.off("pointerdown", this.unlockAudio, this);
      this.scale.off("resize", this.handleResize, this);
    });

    const mode = (this.registry.get("gameMode") as GameMode | undefined) ?? DEFAULT_GAME_MODE;
    this.startMode(mode);
    this.shellEvents?.onMatchStatsChange?.({ wins: this.wins, losses: this.losses });
  }

  update(time: number) {
    if (!this.cursors || !this.wasd) {
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.wasd.R)) {
      this.resetRound();
      return;
    }

    if (this.roundOver || !this.roundActive || !hasHumanPlayer(this.currentMode)) {
      return;
    }

    const player = this.actors.get("player");

    if (!player?.alive) {
      return;
    }

    // Keyboard takes priority; a held touch direction auto-repeats on a cadence.
    const direction = this.getKeyboardDirection() ?? this.getTouchStepDirection(time);

    if (direction) {
      this.tryMovePlayer(player, directionToDelta(direction));
    }

    if (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE) || this.consumeTouchBomb()) {
      this.plantPlayerBomb(player);
    }
  }

  private handleModeChange(mode: GameMode) {
    this.emitAudio("ui.confirm");
    this.startMode(mode);
  }

  private startMode(requestedMode: GameMode) {
    // A campaign round needs a known stage; without one it plays as a local match.
    const stage =
      requestedMode === "campaign"
        ? getCampaignStage(this.shellEvents?.getCampaignStage?.() ?? null)
        : null;
    const mode = requestedMode === "campaign" && !stage ? "player-vs-bot" : requestedMode;

    this.setMusicIntensity("calm");
    this.currentMode = mode;
    this.currentStage = stage;
    this.clearRoundObjects();
    this.arena = stage ? createArena(stage.arena) : createInitialArena();

    const modifiers = stage ? resolveStageModifiers(stage) : null;
    this.botFuseMs = modifiers?.botFuseMs ?? DEFAULT_BOT_FUSE_MS;
    this.botMoveScale = modifiers?.botMoveScale ?? 1;
    this.stageDropRates = modifiers?.powerupDropRates ?? null;
    this.roundOver = false;
    this.roundActive = false;
    this.blocksCleared = 0;
    this.roundSeed = Phaser.Math.Between(1, 1_000_000);
    this.touchBombQueued = false;
    this.lastTouchStepAt = Number.NEGATIVE_INFINITY;
    this.drawArena();

    const botSelection = this.shellEvents?.getBotSelection?.() ?? DEFAULT_BOT_SELECTION;
    const botAProfile = BOT_PROFILES[botSelection["bot-a"]];
    const botBProfile = BOT_PROFILES[botSelection["bot-b"]];

    const spawns = getSpawnPoints(this.arena);

    if (stage) {
      // The stage picks the opponents (two for a gauntlet) and their tuning.
      this.spawnActor("player", spawns[0]);
      stage.bots.forEach((spec, index) => {
        const { profile, loadout } = resolveStageBot(spec);
        this.spawnActor(index === 0 ? "bot-a" : "bot-b", spawns[index + 1], profile, loadout);
      });
    } else if (mode === "player-vs-bot") {
      this.spawnActor("player", spawns[0]);
      this.spawnActor("bot-a", spawns[1], botAProfile);
    } else {
      this.spawnActor("bot-a", spawns[0], botAProfile);
      this.spawnActor("bot-b", spawns[1], botBProfile);
    }

    this.emitLoadout();
    this.emitBotHud();
    this.startRoundCountdown();
  }

  private resetRound() {
    this.emitAudio("ui.confirm");
    this.startMode(this.currentMode);
  }

  private getKeyboardDirection(): Direction | null {
    if (!this.cursors || !this.wasd) {
      return null;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.A)) {
      return "left";
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.D)) {
      return "right";
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W)) {
      return "up";
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S)) {
      return "down";
    }

    return null;
  }

  private getTouchStepDirection(time: number): Direction | null {
    const direction = this.touchInput?.dir ?? null;

    if (!direction) {
      this.lastTouchStepAt = Number.NEGATIVE_INFINITY;
      return null;
    }

    // Step immediately on press, then repeat every TOUCH_STEP_MS while held.
    if (time - this.lastTouchStepAt >= TOUCH_STEP_MS) {
      this.lastTouchStepAt = time;
      return direction;
    }

    return null;
  }

  private handleTouchBomb() {
    this.touchBombQueued = true;
  }

  private consumeTouchBomb(): boolean {
    if (!this.touchBombQueued) {
      return false;
    }

    this.touchBombQueued = false;
    return true;
  }

  private tryMovePlayer(player: CombatActor, delta: GridPoint) {
    const nextTile = {
      x: player.tile.x + delta.x,
      y: player.tile.y + delta.y
    };

    if (!this.canActorMoveTo(player, nextTile)) {
      player.view.bump(delta.x, delta.y);
      this.emitAudio("ui.error");
      return;
    }

    this.moveActorTo(player, nextTile, this.getPlayerMoveDuration(player));
    this.emitAudio("ui.move");
  }

  private plantPlayerBomb(player: CombatActor) {
    if (
      this.activeBombCount(player.id) >= player.loadout.bombs ||
      this.roundOver ||
      !this.roundActive ||
      !player.alive
    ) {
      return;
    }

    this.plantBombAt(player.id, { ...player.tile }, player.loadout.blast, PLAYER_FUSE_MS);
    player.view.plant();
    this.emitAudio("weapon.charge.start");
    this.shellEvents?.onRoundStatusChange?.("Fuse");
  }

  private plantBombAt(owner: ActorId, tile: GridPoint, range: number, fuseMs: number) {
    const world = this.tileToWorld(tile);
    const view = new BombView(this, world.x, world.y, tile.y, owner === "player");

    const bomb: ActiveBomb = {
      owner,
      tile,
      range,
      view,
      timer: this.time.delayedCall(fuseMs, () => this.detonateBomb(bomb)),
      urgentTimer: this.time.delayedCall(fuseMs * 0.62, () => view.setUrgent())
    };

    this.activeBombs.push(bomb);
    this.refreshDangerTiles();

    if (owner !== "player") {
      this.emitAudio("weapon.enemy.fire");
    }

    return bomb;
  }

  private detonateBomb(bomb: ActiveBomb) {
    if (!this.activeBombs.includes(bomb)) {
      return;
    }

    this.activeBombs = this.activeBombs.filter((activeBomb) => activeBomb !== bomb);
    bomb.view.destroy();
    bomb.timer.destroy();
    bomb.urgentTimer.remove(false);
    this.shellEvents?.onRoundStatusChange?.("Blast");

    const blast = resolveBlast(this.arena, bomb.tile, bomb.range);
    this.blocksCleared += blast.clearedBlocks.length;
    this.emitAudio(this.getExplosionAudioEvent(blast));
    playExplosionEffect(this, blast, (tile) => this.tileToWorld(tile));
    this.refreshDangerTiles();
    this.time.delayedCall(220, () => {
      this.clearDestroyedBlocks(blast.clearedBlocks);
      this.spawnPowerups(blast.clearedBlocks);
    });
    this.time.delayedCall(140, () => this.evaluateBlastHits(blast));

    this.time.delayedCall(720, () => {
      if (!this.roundOver && this.activeBombs.length === 0) {
        this.shellEvents?.onRoundStatusChange?.("Live");
      }
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

    if (this.boardLayer) {
      drawArenaFloor(this, this.boardLayer, this.boardOrigin.x, this.boardOrigin.y);
    }

    this.redrawBlocks();
    this.applyCameraFit();
  }

  // Zoom/center the fixed-size board so it is always fully visible. On desktop
  // (board fits natively, no reserved band) the camera is left at its default so
  // behavior is unchanged; otherwise we zoom to fit and re-center via the camera,
  // which preserves tileToWorld math and all absolute-coordinate rendering.
  private applyCameraFit() {
    const camera = this.cameras.main;

    if (!camera) {
      return;
    }

    const boardWidth = ARENA_COLS * CELL_SIZE;
    const boardHeight = ARENA_ROWS * CELL_SIZE;
    const fit = computeArenaBoardFit(this.scale.width, this.scale.height, boardWidth, boardHeight, {
      touchControlsVisible: this.getTouchControlsVisible()
    });

    if (
      fit.zoom >= 1 &&
      fit.reservedSides === 0 &&
      fit.reservedTop + fit.reservedBottom === 0
    ) {
      camera.setZoom(1);
      camera.setScroll(0, 0);
      return;
    }

    camera.setZoom(fit.zoom);

    const boardCenterX = this.boardOrigin.x + boardWidth / 2;
    const boardCenterY = this.boardOrigin.y + boardHeight / 2;
    // Center the board in the region between the reserved top/bottom bands. A
    // larger top band pushes it down; a larger bottom band pushes it up. Side
    // bands are symmetric, so no horizontal shift is needed.
    const verticalNudge = (fit.reservedBottom - fit.reservedTop) / (2 * fit.zoom);
    camera.centerOn(boardCenterX, boardCenterY + verticalNudge);
  }

  private getTouchControlsVisible() {
    const layout = this.registry.get("touchControlsLayout") as TouchControlsLayoutState | undefined;
    return layout?.enabled ?? false;
  }

  private redrawBlocks() {
    this.blockSprites.forEach((block) => block.destroy());
    this.blockSprites = drawArenaBlocks(this, this.arena, (tile) => this.tileToWorld(tile));
  }

  private clearDestroyedBlocks(blocks: GridPoint[]) {
    blocks.forEach((blockTile) => {
      const key = this.tileKey(blockTile);
      const block = this.blockSprites.get(key);

      if (!block) {
        return;
      }

      this.blockSprites.delete(key);
      shatterBlock(this, block, () => block.destroy());
    });
  }

  private spawnPowerups(blocks: GridPoint[]) {
    blocks.forEach((blockTile) => {
      const powerup = choosePowerupDrop(
        blockTile,
        this.stageDropRates ?? this.shellEvents?.getPowerupDropRates?.()
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
      sprite.setDepth(rowDepth(blockTile.y, "actor") - 0.6).setScale(0.3);
      this.tweens.add({ targets: sprite, scale: 1, duration: 220, ease: "Back.easeOut" });
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

  private collectPowerupAt(tile: GridPoint, actorId: ActorId) {
    const key = this.tileKey(tile);
    const powerup = this.activePowerups.get(key);
    const actor = this.actors.get(actorId);

    if (!powerup || !actor) {
      return;
    }

    actor.loadout = applyPowerup(actor.loadout, powerup.type);
    powerup.sprite.destroy();
    this.activePowerups.delete(key);
    this.emitAudio("pickup.powerup");
    this.emitLoadout();
    this.emitBotHud();
  }

  private evaluateBlastHits(blast: BlastResult) {
    if (this.roundOver) {
      return;
    }

    const hitActors = Array.from(this.actors.values()).filter(
      (actor) => actor.alive && tileListIncludes(blast.tiles, actor.tile)
    );

    hitActors.forEach((actor) => {
      actor.alive = false;
      this.emitAudio(actor.kind === "player" ? "player.damage" : "enemy.destroyed");
      actor.view.knockout();
    });

    if (hitActors.length === 0) {
      return;
    }

    this.emitBotHud();

    const outcome = resolveRoundWinner(
      Array.from(this.actors.values()).map((actor) => ({ id: actor.id, alive: actor.alive }))
    );

    if (outcome) {
      this.completeRound(outcome);
    }
  }

  private completeRound(winner: RoundWinner) {
    if (this.roundOver) {
      return;
    }

    this.roundOver = true;
    this.roundActive = false;
    this.botMoveEvent?.remove(false);

    if (hasHumanPlayer(this.currentMode)) {
      if (winner === "player") {
        this.wins += 1;
        this.shellEvents?.onRoundStatusChange?.("Win");
        this.emitAudio("game.victory");
      } else if (winner === "bot") {
        this.losses += 1;
        this.shellEvents?.onRoundStatusChange?.("Down");
        this.emitAudio("game.over");
      } else {
        this.shellEvents?.onRoundStatusChange?.("Draw");
        this.emitAudio("wave.completed");
      }

      this.shellEvents?.onMatchStatsChange?.({ wins: this.wins, losses: this.losses });
    } else if (winner === "draw") {
      this.shellEvents?.onRoundStatusChange?.("Draw");
      this.emitAudio("wave.completed");
    } else if (winner === "bot-a" || winner === "bot-b") {
      const winnerName = this.actors.get(winner)?.profile?.name ?? "Bot";
      this.shellEvents?.onRoundStatusChange?.(`${winnerName} Wins`);
      this.emitAudio("game.victory");
    } else {
      this.shellEvents?.onRoundStatusChange?.("Draw");
      this.emitAudio("wave.completed");
    }

    this.shellEvents?.onRoundComplete?.({
      mode: this.currentMode,
      winner,
      durationMs: Math.round(this.time.now - this.matchStartedAt),
      blocksCleared: this.blocksCleared,
      ...(this.currentStage ? { stageId: this.currentStage.id } : {})
    });
  }

  private spawnActor(
    id: ActorId,
    tile: GridPoint,
    profile?: BotProfile,
    loadout: ActorLoadout = createInitialLoadout()
  ) {
    const world = this.tileToWorld(tile);
    const kind = id === "player" ? "player" : "bot";
    const character = kind === "player" ? "spark" : profile?.id ?? DEFAULT_BOT_SELECTION["bot-a"];
    const view = new FusebotView(this, character, world.x, world.y, {
      marker: kind === "player" ? "P1" : undefined,
      row: tile.y
    });

    this.actors.set(id, {
      id,
      kind,
      tile,
      view,
      alive: true,
      loadout,
      profile,
      nextMoveAt: this.time.now + 280,
      turn: 0
    });
  }

  private startBotAi() {
    this.botMoveEvent?.remove(false);
    this.botMoveEvent = this.time.addEvent({
      delay: BOT_AI_TICK_MS,
      loop: true,
      callback: () => this.moveBots()
    });
  }

  private moveBots() {
    if (this.roundOver || !this.roundActive) {
      return;
    }

    this.getLiveBots().forEach((bot) => {
      if (this.time.now < bot.nextMoveAt) {
        return;
      }

      this.executeBotTurn(bot);
      bot.nextMoveAt = this.time.now + this.getBotNextMoveDelay(bot);
    });
  }

  private executeBotTurn(bot: CombatActor) {
    const opponent = this.findOpponentFor(bot);

    if (!opponent || !bot.profile) {
      return;
    }

    const intent = chooseBotTurn({
      arena: this.arena,
      actor: this.toBotActorState(bot),
      opponentTile: opponent.tile,
      bombs: this.getBombThreats(),
      activeBombCount: this.activeBombCount(bot.id),
      blockedTiles: this.getBlockedTiles(bot.id),
      powerups: this.getBotPowerupTargets(),
      decisionSeed: this.getBotDecisionSeed(bot)
    });

    bot.turn += 1;

    if (intent.type === "wait") {
      return;
    }

    if (intent.type === "plant-bomb") {
      this.plantBombAt(bot.id, { ...bot.tile }, bot.loadout.blast, this.botFuseMs);
      this.shellEvents?.onRoundStatusChange?.("Danger");

      if (intent.moveTo && this.canActorMoveTo(bot, intent.moveTo)) {
        this.moveActorTo(bot, intent.moveTo, this.getBotTweenDuration(bot));
      }

      return;
    }

    if (this.canActorMoveTo(bot, intent.tile)) {
      this.moveActorTo(bot, intent.tile, this.getBotTweenDuration(bot));
    }
  }

  private moveActorTo(actor: CombatActor, tile: GridPoint, duration: number) {
    const from = actor.tile;
    actor.tile = tile;
    const world = this.tileToWorld(tile);
    this.collectPowerupAt(tile, actor.id);
    actor.view.moveTo(world.x, world.y, duration, from.y, tile.y, directionBetween(from, tile));
  }

  private canActorMoveTo(actor: CombatActor, tile: GridPoint) {
    return (
      isWalkable(this.arena, tile) &&
      !this.activeBombAt(tile) &&
      !Array.from(this.actors.values()).some(
        (otherActor) => otherActor.id !== actor.id && otherActor.alive && this.sameTile(otherActor.tile, tile)
      )
    );
  }

  private handleResize() {
    this.drawArena();

    this.actors.forEach((actor) => {
      const world = this.tileToWorld(actor.tile);
      actor.view.setPosition(world.x, world.y, actor.tile.y);
    });

    this.activeBombs.forEach((bomb) => {
      const world = this.tileToWorld(bomb.tile);
      bomb.view.setPosition(world.x, world.y);
    });

    this.dangerOverlay?.clear();
    this.refreshDangerTiles();

    this.activePowerups.forEach((powerup) => {
      const world = this.tileToWorld(powerup.tile);
      powerup.sprite.setPosition(world.x, world.y);
    });
  }

  private activeBombAt(tile: GridPoint) {
    return this.activeBombs.some((bomb) => this.sameTile(bomb.tile, tile));
  }

  private clearRoundObjects() {
    this.botMoveEvent?.remove(false);
    this.clearCountdownEvents();
    this.activeBombs.forEach((bomb) => {
      bomb.timer.destroy();
      bomb.urgentTimer.remove(false);
      bomb.view.destroy();
    });
    this.activeBombs = [];
    this.dangerOverlay?.clear();
    this.activePowerups.forEach((powerup) => powerup.sprite.destroy());
    this.activePowerups.clear();
    this.actors.forEach((actor) => actor.view.destroy());
    this.actors.clear();
    this.fxLayer?.removeAll(true);
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

  private activeBombCount(owner: ActorId) {
    return this.activeBombs.filter((bomb) => bomb.owner === owner).length;
  }

  private getBlockedTiles(actorId: ActorId) {
    const actorTiles = Array.from(this.actors.values())
      .filter((actor) => actor.id !== actorId && actor.alive)
      .map((actor) => actor.tile);

    return [...this.activeBombs.map((bomb) => bomb.tile), ...actorTiles];
  }

  private getBombThreats(): BombThreat[] {
    return this.activeBombs.map((bomb) => ({
      tile: bomb.tile,
      range: bomb.range
    }));
  }

  private refreshDangerTiles() {
    this.dangerOverlay?.update(getDangerTiles(this.arena, this.getBombThreats()), (tile) =>
      this.tileToWorld(tile)
    );
  }

  // Subtle lens vignette; WebGL only, the Canvas renderer simply skips it.
  private applyCameraFx() {
    const camera = this.cameras.main;

    if (this.game.renderer.type !== Phaser.WEBGL || !camera.postFX) {
      return;
    }

    camera.postFX.clear();
    camera.postFX.addVignette(0.5, 0.5, 0.92, 0.32);
  }

  private getBotPowerupTargets(): BotPowerupTarget[] {
    return Array.from(this.activePowerups.values()).map((powerup) => ({
      tile: powerup.tile,
      type: powerup.type
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
        this.emitAudio("wave.countdown.tick");
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
      this.emitAudio("wave.started");
      this.startBotAi();
    });

    this.countdownEvents.push(startEvent);
  }

  private emitLoadout() {
    const player = this.actors.get("player");
    this.shellEvents?.onLoadoutChange?.(player?.loadout ?? createInitialLoadout());
  }

  private emitBotHud() {
    this.shellEvents?.onBotHudChange?.(
      this.getBots().map((bot) => ({
        id: bot.id as BotId,
        name: bot.profile?.name ?? "Bot",
        alive: bot.alive,
        bombs: bot.loadout.bombs,
        blast: bot.loadout.blast,
        speed: bot.loadout.speed
      }))
    );
  }

  private getPlayerMoveDuration(player: CombatActor) {
    return Math.max(54, 104 - player.loadout.speed * 14);
  }

  private getBotMoveDelay(bot: CombatActor) {
    return Math.round(Math.max(260, BASE_BOT_MOVE_MS - bot.loadout.speed * 70) * this.botMoveScale);
  }

  private getBotNextMoveDelay(bot: CombatActor) {
    return Math.max(
      220,
      this.getBotMoveDelay(bot) + Phaser.Math.Between(-BOT_MOVE_JITTER_MS, BOT_MOVE_JITTER_MS)
    );
  }

  private getBotTweenDuration(bot: CombatActor) {
    return Math.max(90, 180 - bot.loadout.speed * 22);
  }

  private getBotDecisionSeed(bot: CombatActor) {
    return this.roundSeed + bot.turn * 101 + (bot.id === "bot-b" ? 9_973 : 0);
  }

  private getPowerupTexture(powerup: PowerupType) {
    return `powerup-${powerup}`;
  }

  private clearCountdownEvents() {
    this.countdownEvents.forEach((event) => event.remove(false));
    this.countdownEvents = [];
  }

  private getBots() {
    return Array.from(this.actors.values()).filter((actor) => actor.kind === "bot");
  }

  private getLiveBots() {
    return this.getBots().filter((bot) => bot.alive);
  }

  private findOpponentFor(actor: CombatActor) {
    if (hasHumanPlayer(this.currentMode)) {
      return actor.kind === "bot" ? this.actors.get("player") : this.getLiveBots()[0];
    }

    return this.getLiveBots().find((bot) => bot.id !== actor.id);
  }

  private toBotActorState(bot: CombatActor): BotActorState {
    return {
      id: bot.id as BotId,
      tile: bot.tile,
      alive: bot.alive,
      loadout: bot.loadout,
      profile: bot.profile ?? BOT_PROFILES[DEFAULT_BOT_SELECTION["bot-a"]],
      turn: bot.turn
    };
  }

  private sameTile(a: GridPoint, b: GridPoint) {
    return a.x === b.x && a.y === b.y;
  }

  private getExplosionAudioEvent(blast: BlastResult): AudioEventName {
    if (blast.clearedBlocks.length >= 2 || blast.tiles.length >= 6) {
      return "explosion.large";
    }

    if (blast.clearedBlocks.length > 0 || blast.tiles.length >= 4) {
      return "explosion.medium";
    }

    return "explosion.small";
  }

  private unlockAudio() {
    void this.audio?.unlock().catch(() => undefined);
  }

  private emitAudio(eventName: AudioEventName) {
    void this.audio?.emit(eventName).catch(() => undefined);
  }

  private setMusicIntensity(intensity: MusicIntensity) {
    void this.audio?.setMusicIntensity(intensity).catch(() => undefined);
  }
}

function directionBetween(from: GridPoint, to: GridPoint): Direction | undefined {
  if (to.x < from.x) {
    return "left";
  }

  if (to.x > from.x) {
    return "right";
  }

  if (to.y < from.y) {
    return "up";
  }

  if (to.y > from.y) {
    return "down";
  }

  return undefined;
}
