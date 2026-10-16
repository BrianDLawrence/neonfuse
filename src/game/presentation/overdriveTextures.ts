import * as Phaser from "phaser";
import { ARENA_COLS, ARENA_ROWS, CELL_SIZE } from "../simulation/arena";
import {
  FUSEBOT_BOUNDS,
  FUSEBOT_IDS,
  drawFusebot,
  drawFusebotGround,
  drawPlayerMarker,
  type FusebotId
} from "./fusebotArt";

/** On-screen Fusebot size in px (art is authored in 100-unit space). */
export const FUSEBOT_SIZE = 50;
/** How far a block's top face rises above its cell, selling the 2.5D look. */
export const BLOCK_LIFT = 12;
/** Transparent margin around block art so baked glows are not clipped. */
export const BLOCK_PAD = 6;
/** Margin of the arena floor texture around the playable grid (frame glow). */
export const FLOOR_FRAME = 20;

export const FUSEBOT_ORIGIN_Y =
  -FUSEBOT_BOUNDS.top / (FUSEBOT_BOUNDS.bottom - FUSEBOT_BOUNDS.top);
export const BLOCK_ORIGIN_Y =
  (BLOCK_PAD + CELL_SIZE / 2 + BLOCK_LIFT) / (CELL_SIZE + BLOCK_PAD * 2 + BLOCK_LIFT);

type Ctx = CanvasRenderingContext2D;

export function fusebotTextureKey(id: FusebotId, blink = false) {
  return blink ? `fusebot-${id}-blink` : `fusebot-${id}`;
}

export function fusebotGroundKey(id: FusebotId, isLocalPlayer: boolean) {
  return isLocalPlayer ? `fusebot-ground-${id}-you` : `fusebot-ground-${id}`;
}

function paint(scene: Phaser.Scene, key: string, width: number, height: number, draw: (ctx: Ctx) => void) {
  if (scene.textures.exists(key)) {
    return;
  }

  const texture = scene.textures.createCanvas(key, Math.ceil(width), Math.ceil(height));

  if (!texture) {
    return;
  }

  const ctx = texture.getContext();
  draw(ctx);
  texture.refresh();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function radial(ctx: Ctx, cx: number, cy: number, r: number, stops: Array<[number, string]>) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

/** Generates every texture the Overdrive look uses. Safe to call more than once. */
export function createOverdriveTextures(scene: Phaser.Scene) {
  createCharacterTextures(scene);
  createArenaTextures(scene);
  createBombTextures(scene);
  createPowerupTextures(scene);
  createEffectTextures(scene);
}

function createCharacterTextures(scene: Phaser.Scene) {
  const u = FUSEBOT_SIZE / 100;
  const width = (FUSEBOT_BOUNDS.right - FUSEBOT_BOUNDS.left) * u;
  const height = (FUSEBOT_BOUNDS.bottom - FUSEBOT_BOUNDS.top) * u;

  FUSEBOT_IDS.forEach((id) => {
    [false, true].forEach((blink) => {
      paint(scene, fusebotTextureKey(id, blink), width, height, (ctx) => {
        ctx.translate(-FUSEBOT_BOUNDS.left * u, -FUSEBOT_BOUNDS.top * u);
        drawFusebot(ctx, id, FUSEBOT_SIZE, { look: 0.6, blink });
      });
    });

    [false, true].forEach((isLocalPlayer) => {
      paint(scene, fusebotGroundKey(id, isLocalPlayer), 40 * u * 2, 16 * u * 2, (ctx) => {
        ctx.translate(40 * u, 16 * u);
        drawFusebotGround(ctx, id, FUSEBOT_SIZE, isLocalPlayer);
      });
    });
  });

  ["P1", "YOU"].forEach((label) => {
    paint(scene, `marker-${label.toLowerCase()}`, 48, 28, (ctx) => {
      ctx.translate(24, 18);
      drawPlayerMarker(ctx, FUSEBOT_SIZE, label);
    });
  });
}

function createArenaTextures(scene: Phaser.Scene) {
  const boardW = ARENA_COLS * CELL_SIZE;
  const boardH = ARENA_ROWS * CELL_SIZE;

  paint(scene, "arena-floor", boardW + FLOOR_FRAME * 2, boardH + FLOOR_FRAME * 2, (ctx) => {
    // Frame: a dark plinth with a cyan edge light.
    ctx.save();
    ctx.shadowColor = "rgba(34, 211, 238, 0.45)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#070a12";
    roundRect(ctx, 8, 8, boardW + FLOOR_FRAME * 2 - 16, boardH + FLOOR_FRAME * 2 - 16, 14);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(34, 211, 238, 0.35)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, 8.5, 8.5, boardW + FLOOR_FRAME * 2 - 17, boardH + FLOOR_FRAME * 2 - 17, 14);
    ctx.stroke();

    ctx.translate(FLOOR_FRAME, FLOOR_FRAME);
    for (let y = 0; y < ARENA_ROWS; y += 1) {
      for (let x = 0; x < ARENA_COLS; x += 1) {
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;
        const gradient = ctx.createLinearGradient(0, py, 0, py + CELL_SIZE);
        gradient.addColorStop(0, (x + y) % 2 ? "#0f1626" : "#101829");
        gradient.addColorStop(1, "#0a0f1b");
        ctx.fillStyle = gradient;
        roundRect(ctx, px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3, 5);
        ctx.fill();
        ctx.fillStyle = "rgba(34, 211, 238, 0.07)";
        ctx.fillRect(px + 6, py + 2, CELL_SIZE - 12, 1);
        ctx.fillStyle = "rgba(34, 211, 238, 0.18)";
        ctx.fillRect(px + 1, py + 1, 2, 2);
      }
    }
  });

  paint(scene, "arena-backdrop", 512, 400, (ctx) => {
    // Both glows fade out fully inside the canvas so the stretched image has no visible edge.
    radial(ctx, 150, 135, 135, [[0, "rgba(34, 211, 238, 0.16)"], [1, "rgba(34, 211, 238, 0)"]]);
    radial(ctx, 362, 265, 135, [[0, "rgba(244, 63, 94, 0.13)"], [1, "rgba(244, 63, 94, 0)"]]);
  });

  const w = CELL_SIZE + BLOCK_PAD * 2;
  const h = CELL_SIZE + BLOCK_PAD * 2 + BLOCK_LIFT;
  const size = CELL_SIZE - 4;
  const left = BLOCK_PAD + 2;
  const top = BLOCK_PAD + 2;

  paint(scene, "hard-block", w, h, (ctx) => {
    // Front face
    let gradient = ctx.createLinearGradient(0, top + size * 0.5, 0, top + size + BLOCK_LIFT);
    gradient.addColorStop(0, "#0b111e");
    gradient.addColorStop(1, "#04060b");
    ctx.fillStyle = gradient;
    roundRect(ctx, left, top + size * 0.5, size, size * 0.5 + BLOCK_LIFT, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(34, 211, 238, 0.55)";
    ctx.fillRect(left + size * 0.22, top + size + BLOCK_LIFT * 0.45, size * 0.56, 1.5);
    // Top face
    gradient = ctx.createLinearGradient(left, top, left + size, top + size);
    gradient.addColorStop(0, "#28334d");
    gradient.addColorStop(0.5, "#171f33");
    gradient.addColorStop(1, "#0f1626");
    ctx.fillStyle = gradient;
    roundRect(ctx, left, top, size, size, 6);
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = "rgba(34, 211, 238, 0.48)";
    ctx.lineWidth = 1.2;
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 8;
    roundRect(ctx, left + 1, top + 1, size - 2, size - 2, 5);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + 8, top + 4.5);
    ctx.lineTo(left + size - 8, top + 4.5);
    ctx.stroke();
  });

  paint(scene, "soft-block", w, h, (ctx) => {
    const inset = 2;
    ctx.fillStyle = "#1c0612";
    roundRect(ctx, left + inset, top + size * 0.5, size - inset * 2, size * 0.5 + BLOCK_LIFT - inset, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(244, 63, 94, 0.45)";
    ctx.fillRect(left + size * 0.25, top + size + BLOCK_LIFT * 0.4, size * 0.5, 1.5);
    const gradient = ctx.createLinearGradient(0, top, 0, top + size);
    gradient.addColorStop(0, "#4a1230");
    gradient.addColorStop(1, "#2a0a1c");
    ctx.fillStyle = gradient;
    roundRect(ctx, left + inset, top + inset, size - inset * 2, size - inset * 2, 5);
    ctx.fill();
    // Hazard hatching, clipped to the top face.
    ctx.save();
    roundRect(ctx, left + inset, top + inset, size - inset * 2, size - inset * 2, 5);
    ctx.clip();
    ctx.strokeStyle = "rgba(244, 63, 94, 0.22)";
    ctx.lineWidth = 2;
    for (let i = -2; i < 6; i += 1) {
      ctx.beginPath();
      ctx.moveTo(left + i * 10, top);
      ctx.lineTo(left + i * 10 + size, top + size);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(251, 113, 133, 0.16)";
    ctx.fillRect(left, top + size * 0.62, size, 2);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(244, 63, 94, 0.88)";
    ctx.lineWidth = 1.4;
    ctx.shadowColor = "#f43f5e";
    ctx.shadowBlur = 9;
    roundRect(ctx, left + inset + 1, top + inset + 1, size - inset * 2 - 2, size - inset * 2 - 2, 4);
    ctx.stroke();
    ctx.restore();
  });
}

function createBombTextures(scene: Phaser.Scene) {
  const draw = (band: string) => (ctx: Ctx) => {
    const cx = 20;
    const cy = 26;
    const r = 13;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + r - 1, r * 0.95, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const gradient = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    gradient.addColorStop(0, "#3b4256");
    gradient.addColorStop(0.6, "#121522");
    gradient.addColorStop(1, "#05060a");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = band;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = band;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.98, r * 0.32, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy - 6, 3.5, 2, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx + 5, cy - r + 2);
    ctx.quadraticCurveTo(cx + 9, cy - r - 6, cx + 13, cy - r - 5);
    ctx.stroke();
  };

  // The local player's bombs carry a cyan band; opponents' bombs are pink.
  paint(scene, "bomb-core", 40, 44, draw("#22d3ee"));
  paint(scene, "bot-bomb-core", 40, 44, draw("#f43f5e"));
}

function createPowerupTextures(scene: Phaser.Scene) {
  const chip = (color: string, glyph: (ctx: Ctx) => void) => (ctx: Ctx) => {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(8, 10, 18, 0.92)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Chamfered hexagon chip.
    const cx = 20;
    const cy = 20;
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI / 6 + (i * Math.PI) / 3;
      const px = cx + Math.cos(angle) * 14;
      const py = cy + Math.sin(angle) * 14;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    glyph(ctx);
    ctx.restore();
  };

  paint(scene, "powerup-bomb", 40, 40, chip("#a3e635", (ctx) => {
    ctx.beginPath();
    ctx.arc(19, 22, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(22, 16);
    ctx.lineTo(25, 13);
    ctx.stroke();
    ctx.fillRect(25, 11, 2.5, 2.5);
  }));
  paint(scene, "powerup-blast", 40, 40, chip("#22d3ee", (ctx) => {
    ctx.fillRect(18.5, 11, 3, 18);
    ctx.fillRect(11, 18.5, 18, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(18.5, 18.5, 3, 3);
  }));
  paint(scene, "powerup-speed", 40, 40, chip("#f59e0b", (ctx) => {
    ctx.beginPath();
    ctx.moveTo(13, 13);
    ctx.lineTo(21, 20);
    ctx.lineTo(13, 27);
    ctx.closePath();
    ctx.moveTo(20, 13);
    ctx.lineTo(28, 20);
    ctx.lineTo(20, 27);
    ctx.closePath();
    ctx.fill();
  }));
}

function createEffectTextures(scene: Phaser.Scene) {
  paint(scene, "glow", 128, 128, (ctx) => {
    radial(ctx, 64, 64, 64, [
      [0, "rgba(255, 255, 255, 1)"],
      [0.25, "rgba(255, 255, 255, 0.55)"],
      [1, "rgba(255, 255, 255, 0)"]
    ]);
  });

  paint(scene, "spark", 12, 12, (ctx) => {
    radial(ctx, 6, 6, 6, [
      [0, "rgba(255, 255, 255, 1)"],
      [0.45, "rgba(255, 255, 255, 0.8)"],
      [1, "rgba(255, 255, 255, 0)"]
    ]);
  });

  paint(scene, "debris", 5, 5, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 5, 5);
  });

  paint(scene, "shock-ring", 128, 128, (ctx) => {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 6;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.stroke();
  });

  paint(scene, "scorch", 64, 64, (ctx) => {
    radial(ctx, 32, 32, 30, [
      [0, "rgba(0, 0, 0, 0.85)"],
      [0.6, "rgba(40, 14, 8, 0.45)"],
      [1, "rgba(0, 0, 0, 0)"]
    ]);
  });

  paint(scene, "danger-tile", CELL_SIZE, CELL_SIZE, (ctx) => {
    ctx.fillStyle = "rgba(244, 63, 94, 0.2)";
    roundRect(ctx, 5, 5, CELL_SIZE - 10, CELL_SIZE - 10, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(251, 113, 133, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Corner ticks give a shape cue that does not rely on color alone.
    ctx.strokeStyle = "rgba(255, 228, 230, 0.9)";
    ctx.lineWidth = 2;
    const a = 9;
    const b = CELL_SIZE - 9;
    const t = 6;
    ctx.beginPath();
    ctx.moveTo(a, a + t); ctx.lineTo(a, a); ctx.lineTo(a + t, a);
    ctx.moveTo(b - t, a); ctx.lineTo(b, a); ctx.lineTo(b, a + t);
    ctx.moveTo(b, b - t); ctx.lineTo(b, b); ctx.lineTo(b - t, b);
    ctx.moveTo(a + t, b); ctx.lineTo(a, b); ctx.lineTo(a, b - t);
    ctx.stroke();
  });

  paint(scene, "blast-glow", 80, 80, (ctx) => {
    radial(ctx, 40, 40, 40, [
      [0, "rgba(255, 248, 230, 1)"],
      [0.35, "rgba(245, 158, 11, 0.9)"],
      [0.7, "rgba(244, 63, 94, 0.45)"],
      [1, "rgba(244, 63, 94, 0)"]
    ]);
  });

  paint(scene, "blast-core", CELL_SIZE, CELL_SIZE, (ctx) => {
    ctx.save();
    ctx.shadowColor = "#fff7d6";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    roundRect(ctx, 6, 6, CELL_SIZE - 12, CELL_SIZE - 12, 8);
    ctx.fill();
    ctx.restore();
  });
}
