import * as Phaser from "phaser";
import { createOverdriveTextures } from "../presentation/overdriveTextures";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  create() {
    createOverdriveTextures(this);
    this.scene.start("ArenaScene");
  }
}
