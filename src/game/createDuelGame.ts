import * as Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { DuelScene, type DuelView } from "./scenes/DuelScene";

export function createDuelGame(parent: HTMLElement, view: DuelView) {
  return new Phaser.Game({
    type: Phaser.AUTO, parent, backgroundColor: "#07080d",
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    scene: [BootScene, PreloadScene, new DuelScene(view)]
  });
}
