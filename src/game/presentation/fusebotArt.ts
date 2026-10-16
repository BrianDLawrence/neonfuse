import type { BotProfileId } from "../simulation/bots";

/**
 * Fusebot character art, drawn with the plain Canvas 2D API so both Phaser
 * (generated textures) and React (roster portraits) can share it. No engine
 * imports and no gameplay state: this module only paints pixels.
 */
export type FusebotId = "spark" | BotProfileId;

type FusebotStyle = {
  accent: string;
  body: string;
  shade: string;
  eye: string;
  rim: string;
};

export const FUSEBOT_STYLES: Record<FusebotId, FusebotStyle> = {
  spark: { accent: "#22d3ee", body: "#eef6ff", shade: "#9fb3c8", eye: "#22d3ee", rim: "#22d3ee" },
  "fuse-rush": { accent: "#f43f5e", body: "#f43f5e", shade: "#7f1231", eye: "#fde68a", rim: "#fb7185" },
  "circuit-shade": { accent: "#8b5cf6", body: "#3b2370", shade: "#1a0f36", eye: "#e9d5ff", rim: "#a78bfa" },
  "volt-warden": { accent: "#22d3ee", body: "#0f4c5c", shade: "#062a33", eye: "#a3e635", rim: "#67e8f9" },
  "glitch-bloom": { accent: "#a3e635", body: "#a3e635", shade: "#3f6212", eye: "#f43f5e", rim: "#d9f99d" }
};

export const FUSEBOT_IDS = Object.keys(FUSEBOT_STYLES) as FusebotId[];

/** Body canvas bounds in art units (1 unit = size / 100), relative to the feet. */
export const FUSEBOT_BOUNDS = { left: -56, right: 56, top: -124, bottom: 6 } as const;

/** Where each character's antenna sparks sit, in art units relative to the feet. */
export const FUSEBOT_SPARK_POINTS: Record<FusebotId, Array<{ x: number; y: number; color: number }>> = {
  spark: [{ x: 20, y: -104, color: 0xf59e0b }],
  "fuse-rush": [{ x: 0, y: -112, color: 0xf59e0b }],
  "circuit-shade": [],
  "volt-warden": [
    { x: -16, y: -110, color: 0xa3e635 },
    { x: 16, y: -110, color: 0xa3e635 }
  ],
  "glitch-bloom": [{ x: 20, y: -104, color: 0xf59e0b }]
};

export function fusebotAccent(id: FusebotId) {
  return parseInt(FUSEBOT_STYLES[id].accent.slice(1), 16);
}

type Ctx = CanvasRenderingContext2D;

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

function glowDot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.25, color);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Paint a Fusebot standing with its feet at (0, 0) of the current transform.
 * `look` shifts the eyes horizontally (-1..1); `blink` closes them.
 */
export function drawFusebot(ctx: Ctx, id: FusebotId, size: number, { look = 0.5, blink = false } = {}) {
  const c = FUSEBOT_STYLES[id];
  const u = size / 100;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Feet
  ctx.fillStyle = c.shade;
  roundRect(ctx, -17 * u, -9 * u, 13 * u, 9 * u, 4 * u);
  ctx.fill();
  roundRect(ctx, 4 * u, -9 * u, 13 * u, 9 * u, 4 * u);
  ctx.fill();

  if (id === "volt-warden") {
    ctx.fillStyle = "#0b3a46";
    ctx.strokeStyle = "#a3e635";
    ctx.lineWidth = 1.6 * u;
    ctx.shadowColor = "#a3e635";
    ctx.shadowBlur = 8 * u;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * 24 * u, -28 * u, 10 * u, 8 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // Body
  let gradient = ctx.createLinearGradient(0, -38 * u, 0, -6 * u);
  gradient.addColorStop(0, c.body);
  gradient.addColorStop(1, c.shade);
  ctx.fillStyle = gradient;
  roundRect(ctx, -20 * u, -38 * u, 40 * u, 32 * u, 11 * u);
  ctx.fill();
  drawChestEmblem(ctx, id, u);

  // Head
  const headY = -86 * u;
  const headH = 52 * u;
  gradient = ctx.createLinearGradient(0, headY, 0, headY + headH);
  gradient.addColorStop(0, id === "spark" ? "#ffffff" : c.rim);
  gradient.addColorStop(0.45, c.body);
  gradient.addColorStop(1, c.shade);
  ctx.fillStyle = gradient;
  ctx.shadowColor = c.accent;
  ctx.shadowBlur = 16 * u;
  roundRect(ctx, -31 * u, headY, 62 * u, headH, 23 * u);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(c.rim, 0.9);
  ctx.lineWidth = 1.5 * u;
  roundRect(ctx, -31 * u, headY, 62 * u, headH, 23 * u);
  ctx.stroke();

  if (id === "circuit-shade") {
    drawHood(ctx, c, u);
  }

  // Visor
  ctx.fillStyle = "#04060b";
  roundRect(ctx, -23 * u, -73 * u, 46 * u, 23 * u, 10 * u);
  ctx.fill();
  ctx.strokeStyle = withAlpha(c.accent, 0.5);
  ctx.lineWidth = u;
  ctx.stroke();

  drawEyes(ctx, id, c, u, look, blink);

  // Visor glint
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.beginPath();
  ctx.moveTo(-18 * u, -71 * u);
  ctx.lineTo(-8 * u, -71 * u);
  ctx.lineTo(-16 * u, -53 * u);
  ctx.lineTo(-21 * u, -56 * u);
  ctx.closePath();
  ctx.fill();

  drawHeadgear(ctx, id, u);
  ctx.restore();
}

function drawChestEmblem(ctx: Ctx, id: FusebotId, u: number) {
  const c = FUSEBOT_STYLES[id];
  ctx.save();
  ctx.shadowBlur = 10 * u;

  if (id === "spark") {
    ctx.shadowColor = c.accent;
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(0, -22 * u, 5.5 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === "fuse-rush") {
    roundRect(ctx, -14 * u, -28 * u, 28 * u, 10 * u, 3 * u);
    ctx.clip();
    for (let i = -4; i < 6; i += 1) {
      ctx.fillStyle = i % 2 ? "#f59e0b" : "#1a0610";
      ctx.beginPath();
      ctx.moveTo(i * 6 * u, -28 * u);
      ctx.lineTo((i * 6 + 4) * u, -28 * u);
      ctx.lineTo((i * 6 - 4) * u, -18 * u);
      ctx.lineTo((i * 6 - 8) * u, -18 * u);
      ctx.fill();
    }
  } else if (id === "circuit-shade") {
    ctx.strokeStyle = c.rim;
    ctx.shadowColor = c.accent;
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(-12 * u, -30 * u);
    ctx.lineTo(-4 * u, -30 * u);
    ctx.lineTo(0, -24 * u);
    ctx.lineTo(10 * u, -24 * u);
    ctx.moveTo(-8 * u, -16 * u);
    ctx.lineTo(4 * u, -16 * u);
    ctx.stroke();
    glowDot(ctx, 10 * u, -24 * u, 4 * u, c.accent);
  } else if (id === "volt-warden") {
    ctx.shadowColor = "#a3e635";
    ctx.fillStyle = "#a3e635";
    ctx.beginPath();
    ctx.moveTo(3 * u, -33 * u);
    ctx.lineTo(-6 * u, -20 * u);
    ctx.lineTo(0, -20 * u);
    ctx.lineTo(-3 * u, -11 * u);
    ctx.lineTo(7 * u, -24 * u);
    ctx.lineTo(u, -24 * u);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.shadowColor = "#f43f5e";
    ctx.fillStyle = "#f43f5e";
    for (let i = 0; i < 3; i += 1) {
      ctx.fillRect((-9 + i * 7) * u, (-26 + (i % 2) * 4) * u, 4 * u, 4 * u);
    }
  }

  ctx.restore();
}

function drawHood(ctx: Ctx, c: FusebotStyle, u: number) {
  ctx.fillStyle = "#1c1040";
  ctx.strokeStyle = c.rim;
  ctx.lineWidth = 1.5 * u;
  ctx.beginPath();
  ctx.moveTo(-36 * u, -40 * u);
  ctx.quadraticCurveTo(-40 * u, -96 * u, 0, -98 * u);
  ctx.quadraticCurveTo(40 * u, -96 * u, 36 * u, -40 * u);
  ctx.lineTo(28 * u, -44 * u);
  ctx.quadraticCurveTo(30 * u, -82 * u, 0, -84 * u);
  ctx.quadraticCurveTo(-30 * u, -82 * u, -28 * u, -44 * u);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = withAlpha(c.accent, 0.9);
  ctx.lineWidth = 1.1 * u;
  ctx.beginPath();
  ctx.moveTo(-18 * u, -91 * u);
  ctx.lineTo(-10 * u, -86 * u);
  ctx.lineTo(-10 * u, -80 * u);
  ctx.moveTo(14 * u, -92 * u);
  ctx.lineTo(20 * u, -84 * u);
  ctx.stroke();
}

function drawEyes(ctx: Ctx, id: FusebotId, c: FusebotStyle, u: number, look: number, blink: boolean) {
  ctx.save();
  ctx.fillStyle = c.eye;
  ctx.strokeStyle = c.eye;
  ctx.shadowColor = c.eye;
  ctx.shadowBlur = 12 * u;
  const ex = look * 4 * u;
  const ey = -62 * u;
  const eyeH = blink ? 2 * u : 10 * u;

  if (id === "circuit-shade") {
    roundRect(ctx, -15 * u + ex, ey - 2 * u, 30 * u, blink ? 1.5 * u : 4 * u, 2 * u);
    ctx.fill();
  } else if (id === "fuse-rush") {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ex + side * 4 * u, ey - (blink ? 1 : 3) * u);
      ctx.lineTo(ex + side * 15 * u, ey - (blink ? 1 : 7) * u);
      ctx.lineTo(ex + side * 15 * u, ey + (blink ? 1 : 4) * u);
      ctx.lineTo(ex + side * 4 * u, ey + (blink ? 1 : 4) * u);
      ctx.closePath();
      ctx.fill();
    }
  } else if (id === "glitch-bloom") {
    ctx.beginPath();
    ctx.arc(-9 * u + ex, ey, blink ? 1.5 * u : 5 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.6 * u;
    ctx.beginPath();
    ctx.moveTo(5 * u + ex, ey - 4 * u);
    ctx.lineTo(13 * u + ex, ey + 4 * u);
    ctx.moveTo(13 * u + ex, ey - 4 * u);
    ctx.lineTo(5 * u + ex, ey + 4 * u);
    ctx.stroke();
  } else {
    const width = id === "volt-warden" ? 9 : 8;
    const radius = (id === "volt-warden" ? 1 : 3) * u;
    roundRect(ctx, -13 * u + ex, ey - eyeH / 2, width * u, eyeH, radius);
    ctx.fill();
    roundRect(ctx, 5 * u + ex, ey - eyeH / 2, width * u, eyeH, radius);
    ctx.fill();
  }

  ctx.restore();
}

function drawHeadgear(ctx: Ctx, id: FusebotId, u: number) {
  if (id === "spark" || id === "glitch-bloom") {
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2.2 * u;
    ctx.beginPath();
    ctx.moveTo(9 * u, -86 * u);
    ctx.quadraticCurveTo(12 * u, -100 * u, 20 * u, -104 * u);
    ctx.stroke();
    glowDot(ctx, 20 * u, -104 * u, 9 * u, "rgba(245, 158, 11, 0.9)");
  }

  if (id === "fuse-rush") {
    ctx.save();
    for (let i = 0; i < 3; i += 1) {
      const fx = (-12 + i * 12) * u;
      const fh = (20 + (i === 1 ? 10 : 0)) * u;
      const gradient = ctx.createLinearGradient(0, -86 * u - fh, 0, -84 * u);
      gradient.addColorStop(0, "rgba(253, 230, 138, 0.95)");
      gradient.addColorStop(0.5, "#f59e0b");
      gradient.addColorStop(1, "#f43f5e");
      ctx.fillStyle = gradient;
      ctx.shadowColor = "#f59e0b";
      ctx.shadowBlur = 14 * u;
      ctx.beginPath();
      ctx.moveTo(fx - 7 * u, -82 * u);
      ctx.quadraticCurveTo(fx - 4 * u, -86 * u - fh * 0.6, fx + 2 * u, -86 * u - fh);
      ctx.quadraticCurveTo(fx + 2 * u, -86 * u - fh * 0.4, fx + 7 * u, -82 * u);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  if (id === "volt-warden") {
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2 * u;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 16 * u, -84 * u);
      for (let k = 0; k < 4; k += 1) {
        ctx.lineTo(side * (16 + (k % 2 ? 4 : -2)) * u, (-90 - k * 5) * u);
      }
      ctx.stroke();
      glowDot(ctx, side * 16 * u, -110 * u, 7 * u, "rgba(163, 230, 53, 0.95)");
    }
  }

  if (id === "glitch-bloom") {
    ctx.save();
    for (let i = 0; i < 5; i += 1) {
      const angle = i * ((Math.PI * 2) / 5);
      ctx.save();
      ctx.translate(-6 * u, -90 * u);
      ctx.rotate(angle);
      ctx.fillStyle = i % 2 ? "#f43f5e" : "#d9f99d";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8 * u;
      ctx.beginPath();
      ctx.ellipse(0, -9 * u, 5 * u, 9 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(-6 * u, -90 * u, 4 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Ground shadow plus the colored ring that marks a fighter's tile. */
export function drawFusebotGround(ctx: Ctx, id: FusebotId, size: number, isPlayer: boolean) {
  const c = FUSEBOT_STYLES[id];
  const u = size / 100;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 30 * u, 9 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(c.accent, isPlayer ? 0.9 : 0.4);
  ctx.lineWidth = (isPlayer ? 2.2 : 1.4) * u;
  ctx.shadowColor = c.accent;
  ctx.shadowBlur = 10 * u;
  ctx.beginPath();
  ctx.ellipse(0, 0, 34 * u, 11 * u, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** The floating chevron and label above the local player. */
export function drawPlayerMarker(ctx: Ctx, size: number, label: string) {
  const u = size / 100;
  ctx.save();
  ctx.fillStyle = "#22d3ee";
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 10 * u;
  ctx.beginPath();
  ctx.moveTo(-7 * u, 0);
  ctx.lineTo(7 * u, 0);
  ctx.lineTo(0, 8 * u);
  ctx.closePath();
  ctx.fill();
  ctx.font = `800 ${Math.max(9, Math.round(12 * u))}px "Chakra Petch", Inter, ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label, 0, -4 * u);
  ctx.restore();
}
