import * as Phaser from "phaser";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  create() {
    this.createGeneratedTextures();
    this.scene.start("ArenaScene");
  }

  private createGeneratedTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);

    graphics.fillStyle(0x22d3ee, 1);
    graphics.fillRoundedRect(0, 0, 34, 34, 8);
    graphics.lineStyle(2, 0xf8fafc, 0.9);
    graphics.strokeRoundedRect(3, 3, 28, 28, 7);
    graphics.generateTexture("player-core", 34, 34);
    graphics.clear();

    graphics.fillStyle(0xf43f5e, 1);
    graphics.fillRoundedRect(0, 0, 34, 34, 8);
    graphics.lineStyle(2, 0xf59e0b, 0.9);
    graphics.strokeRoundedRect(3, 3, 28, 28, 7);
    graphics.fillStyle(0x101217, 1);
    graphics.fillRect(10, 11, 5, 5);
    graphics.fillRect(20, 11, 5, 5);
    graphics.generateTexture("bot-core", 34, 34);
    graphics.clear();

    graphics.fillStyle(0xf43f5e, 1);
    graphics.fillCircle(18, 20, 15);
    graphics.fillStyle(0xf59e0b, 1);
    graphics.fillCircle(26, 9, 5);
    graphics.generateTexture("bomb-core", 36, 36);
    graphics.clear();

    graphics.fillStyle(0xf43f5e, 1);
    graphics.fillCircle(18, 20, 15);
    graphics.fillStyle(0x22d3ee, 1);
    graphics.fillCircle(26, 9, 5);
    graphics.lineStyle(2, 0xf59e0b, 0.8);
    graphics.strokeCircle(18, 20, 15);
    graphics.generateTexture("bot-bomb-core", 36, 36);
    graphics.clear();

    graphics.fillStyle(0x151924, 1);
    graphics.fillRoundedRect(0, 0, 38, 38, 6);
    graphics.lineStyle(2, 0x22d3ee, 0.44);
    graphics.strokeRoundedRect(2, 2, 34, 34, 5);
    graphics.generateTexture("hard-block", 38, 38);
    graphics.clear();

    graphics.fillStyle(0x2b1020, 1);
    graphics.fillRoundedRect(0, 0, 38, 38, 6);
    graphics.lineStyle(2, 0xf43f5e, 0.5);
    graphics.strokeRoundedRect(2, 2, 34, 34, 5);
    graphics.generateTexture("soft-block", 38, 38);
    graphics.clear();

    graphics.fillStyle(0xa3e635, 1);
    graphics.fillRoundedRect(0, 0, 16, 16, 3);
    graphics.generateTexture("spark", 16, 16);
    graphics.clear();

    graphics.fillStyle(0xa3e635, 1);
    graphics.fillCircle(18, 18, 15);
    graphics.fillStyle(0x101217, 1);
    graphics.fillRoundedRect(13, 7, 10, 22, 3);
    graphics.fillRoundedRect(7, 13, 22, 10, 3);
    graphics.generateTexture("powerup-bomb", 36, 36);
    graphics.clear();

    graphics.fillStyle(0x22d3ee, 1);
    graphics.fillCircle(18, 18, 15);
    graphics.fillStyle(0x101217, 1);
    graphics.fillRect(16, 8, 4, 20);
    graphics.fillRect(8, 16, 20, 4);
    graphics.generateTexture("powerup-blast", 36, 36);
    graphics.clear();

    graphics.fillStyle(0xf59e0b, 1);
    graphics.fillCircle(18, 18, 15);
    graphics.fillStyle(0x101217, 1);
    graphics.fillTriangle(12, 8, 26, 18, 12, 28);
    graphics.generateTexture("powerup-speed", 36, 36);
    graphics.destroy();
  }
}
