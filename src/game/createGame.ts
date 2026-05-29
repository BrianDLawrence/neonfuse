import * as Phaser from "phaser";
import { ArenaScene } from "./scenes/ArenaScene";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";

export type GameEvents = {
  onRoundStatusChange?: (status: string) => void;
  onLoadoutChange?: (loadout: { bombs: number; blast: number; speed: number }) => void;
  onMatchStatsChange?: (stats: { wins: number; losses: number }) => void;
};

type CreateGameOptions = {
  parent: HTMLElement;
  events?: GameEvents;
};

export function createGame({ parent, events }: CreateGameOptions) {
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

  return game;
}
