import * as Phaser from "phaser";
import { ArenaScene } from "./scenes/ArenaScene";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { DEFAULT_GAME_MODE, type GameMode } from "./modes";
import type { BotId, BotSelection } from "./simulation/bots";
import type { PowerupDropRates } from "./simulation/powerups";

export type BotHudState = {
  id: BotId;
  name: string;
  alive: boolean;
  bombs: number;
  blast: number;
  speed: number;
};

export type GameEvents = {
  onRoundStatusChange?: (status: string) => void;
  onLoadoutChange?: (loadout: { bombs: number; blast: number; speed: number }) => void;
  onBotHudChange?: (bots: BotHudState[]) => void;
  onMatchStatsChange?: (stats: { wins: number; losses: number }) => void;
  getPowerupDropRates?: () => PowerupDropRates;
  getBotSelection?: () => BotSelection;
};

type CreateGameOptions = {
  parent: HTMLElement;
  initialMode?: GameMode;
  events?: GameEvents;
};

export function createGame({ parent, initialMode = DEFAULT_GAME_MODE, events }: CreateGameOptions) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#07080d",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: parent.clientWidth,
      height: parent.clientHeight
    },
    physics: {
      default: "arcade",
      arcade: {
        debug: false
      }
    },
    scene: [BootScene, PreloadScene, ArenaScene]
  });

  game.registry.set("events", events);
  game.registry.set("gameMode", initialMode);

  return game;
}
