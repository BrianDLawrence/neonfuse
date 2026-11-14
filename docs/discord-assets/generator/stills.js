// Paints the three Discord stills from the game's own art. Nothing here is drawn
// from scratch that the game already draws: blocks, floor, bombs, power-up chips and
// blast flames come from overdriveTextures.ts, and the Fusebots from fusebotArt.ts.
// generate.mjs serves those TypeScript files to this page, transpiled on request.
import {
  BLOCK_ORIGIN_Y,
  FLOOR_FRAME,
  createOverdriveTextures,
  ensureArenaFloorTexture
} from "/src/game/presentation/overdriveTextures.ts";
import { drawFusebot, drawFusebotGround, drawPlayerMarker } from "/src/game/presentation/fusebotArt.ts";
import { CELL_SIZE } from "/src/game/simulation/arena.ts";

/** Game textures are authored for 48px cells; paint them 4x so they stay sharp when enlarged. */
const TEXTURE_SCALE = 4;
const textures = new Map();

/**
 * Canvas shadowBlur ignores the transform, so a scaled-up texture would get a
 * glow that is too tight. This wrapper scales the blur along with everything else.
 */
function scaledContext(ctx, scale) {
  return new Proxy(ctx, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value === "function") return value.bind(target);
      return prop === "shadowBlur" ? value / scale : value;
    },
    set(target, prop, value) {
      target[prop] = prop === "shadowBlur" ? value * scale : value;
      return true;
    }
  });
}

/** The small part of Phaser.Scene that the texture painters use. */
const scene = {
  textures: {
    exists: (key) => textures.has(key),
    createCanvas(key, width, height) {
      const canvas = document.createElement("canvas");
      canvas.width = width * TEXTURE_SCALE;
      canvas.height = height * TEXTURE_SCALE;
      const ctx = canvas.getContext("2d");
      ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
      textures.set(key, { canvas, w: width, h: height });
      return { getContext: () => scaledContext(ctx, TEXTURE_SCALE), refresh() {} };
    }
  }
};

const tokens = getComputedStyle(document.documentElement);
const token = (name) => tokens.getPropertyValue(name).trim();

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Seeded, so every run paints the same sparks. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

function stamp(ctx, key, x, y, k, { ox = 0.5, oy = 0.5, w, h, alpha = 1 } = {}) {
  const texture = textures.get(key);
  const dw = w ?? texture.w * k;
  const dh = h ?? texture.h * k;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(texture.canvas, x - dw * ox, y - dh * oy, dw, dh);
  ctx.restore();
}

function glow(ctx, x, y, radius, color, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** The near-black field with the arena's cyan and pink backdrop glows. */
function paintField(ctx, width, height, strength = 1) {
  ctx.fillStyle = token("--background-deep");
  ctx.fillRect(0, 0, width, height);
  // Same placement as the "arena-backdrop" texture: cyan upper left, pink lower right.
  const r = Math.max(width, height) * 0.62;
  glow(ctx, width * 0.26, height * 0.3, r, token("--cyan"), 0.16 * strength);
  glow(ctx, width * 0.74, height * 0.7, r, token("--pink"), 0.13 * strength);
}

/**
 * Draws a board the way ArenaScene lays it out: floor plate, then blocks and
 * actors row by row so nearer rows overlap farther ones.
 * `rows` are strings of "H" (hard block), "s" (soft block) and "." (floor).
 */
function paintArena(ctx, { rows, cell, x0, y0, actors = [], floor = true, fromRow = 0, toRow = rows.length - 1 }) {
  const k = cell / CELL_SIZE;
  const centre = (x, y) => ({ x: x0 + (x + 0.5) * cell, y: y0 + (y + 0.5) * cell });

  if (floor) {
    const key = ensureArenaFloorTexture(scene, rows[0].length, rows.length);
    stamp(ctx, key, x0 - FLOOR_FRAME * k, y0 - FLOOR_FRAME * k, k, { ox: 0, oy: 0 });
  }

  for (let y = fromRow; y <= toRow; y += 1) {
    [...rows[y]].forEach((type, x) => {
      if (type === ".") return;
      const at = centre(x, y);
      stamp(ctx, type === "H" ? "hard-block" : "soft-block", at.x, at.y, k, { oy: BLOCK_ORIGIN_Y });
    });

    actors
      .filter((actor) => actor.y === y)
      .forEach((actor) => {
        const at = centre(actor.x, actor.y);
        if (actor.kind === "bot") paintFusebot(ctx, actor, at, cell);
        if (actor.kind === "bomb") stamp(ctx, actor.own ? "bomb-core" : "bot-bomb-core", at.x, at.y + 2 * k, k * 1.15, { oy: 0.62 });
        if (actor.kind === "chip") stamp(ctx, actor.key, at.x, at.y, k);
        if (actor.kind === "blast") paintBlast(ctx, actor, centre, cell);
      });
  }
}

function paintFusebot(ctx, actor, at, cell) {
  const size = (50 * cell) / CELL_SIZE;
  ctx.save();
  ctx.translate(at.x, at.y + cell * 0.3);
  drawFusebotGround(ctx, actor.id, size, Boolean(actor.you));
  drawFusebot(ctx, actor.id, size, { look: actor.look ?? 0 });
  if (actor.you) {
    ctx.translate(0, -1.3 * size);
    drawPlayerMarker(ctx, size, "YOU");
  }
  ctx.restore();
}

/** A still of playFlameTile() from explosionEffect.ts at the moment the flames are full. */
function paintBlast(ctx, blast, centre, cell) {
  const k = cell / CELL_SIZE;
  const random = seededRandom(blast.seed ?? 7);
  const along = cell + 4 * k;
  const across = cell * 0.7;
  const coreAcross = cell * 0.32;
  const tiles = [{ x: blast.x, y: blast.y, dx: 0, dy: 0 }];
  for (const [dx, dy, reach] of [
    [-1, 0, blast.left ?? 0],
    [1, 0, blast.right ?? 0],
    [0, -1, blast.up ?? 0],
    [0, 1, blast.down ?? 0]
  ]) {
    for (let step = 1; step <= reach; step += 1) tiles.push({ x: blast.x + dx * step, y: blast.y + dy * step, dx, dy });
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const origin = centre(blast.x, blast.y);
  glow(ctx, origin.x, origin.y, cell * 2.6, "#ffc46b", 0.5);

  tiles.forEach((tile) => {
    const at = centre(tile.x, tile.y);
    const isOrigin = !tile.dx && !tile.dy;
    const wide = isOrigin || tile.dx !== 0;
    const tall = isOrigin || tile.dy !== 0;
    stamp(ctx, "blast-glow", at.x, at.y - 4 * k, k, {
      w: (wide ? along : across) + 20 * k,
      h: (tall ? along : across) + 20 * k
    });
    stamp(ctx, "blast-core", at.x, at.y - 4 * k, k, {
      w: isOrigin ? cell * 0.8 : wide ? along : coreAcross,
      h: isOrigin ? cell * 0.8 : tall ? along : coreAcross
    });
    const sparks = isOrigin ? 14 : 6;
    for (let i = 0; i < sparks; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = (0.25 + random() * 0.75) * cell;
      const color = ["#f59e0b", "#fff7d6", "#f43f5e"][Math.floor(random() * 3)];
      glow(ctx, at.x + Math.cos(angle) * distance, at.y - 6 * k + Math.sin(angle) * distance, (1.5 + random() * 3) * k, color, 0.95);
    }
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// App icon, 1024x1024. Discord shows it as a small round or rounded tile, so it
// is one shape: Spark, the player's Fusebot, from the chest up.
// ---------------------------------------------------------------------------
function paintIcon(stage) {
  const size = 1024;
  const { canvas, ctx } = makeCanvas(size, size);
  stage.append(canvas);

  paintField(ctx, size, size, 1.5);
  glow(ctx, size * 0.92, size * 0.9, 620, token("--pink"), 0.22);
  // A cyan halo behind the head lifts it off the field at 32-64px.
  glow(ctx, size / 2, 520, 560, token("--cyan"), 0.34);

  ctx.save();
  // Feet sit below the tile, so the frame crops the body like a portrait.
  ctx.translate(size / 2, 1110);
  drawFusebot(ctx, "spark", 900, { look: 0 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cover art, 1024x576. The wordmark over the bottom rows of an arena: Spark has
// just planted a bomb, and the four rival Fusebots wait between the pillars.
// ---------------------------------------------------------------------------
function paintCover(stage) {
  const width = 1024;
  const height = 576;
  const { canvas, ctx } = makeCanvas(width, height);
  stage.append(canvas);
  paintField(ctx, width, height, 1.6);

  const board = {
    rows: ["H.H.H.H.H", "s.......s", "H.H.H.H.H", "ss.....ss"],
    cell: 128,
    x0: -64,
    y0: 32,
    actors: [
      { kind: "bot", id: "fuse-rush", x: 1, y: 2, look: 0.6 },
      { kind: "bot", id: "circuit-shade", x: 3, y: 2, look: 0.3 },
      { kind: "bot", id: "volt-warden", x: 5, y: 2, look: -0.3 },
      { kind: "bot", id: "glitch-bloom", x: 7, y: 2, look: -0.6 },
      { kind: "bomb", own: true, x: 3, y: 3 },
      { kind: "bot", id: "spark", x: 4, y: 3, look: 0, you: true },
      { kind: "chip", key: "powerup-blast", x: 6, y: 3 }
    ]
  };

  // The far rows fade into the field so the wordmark has a quiet place to sit.
  const far = makeCanvas(width, height);
  paintArena(far.ctx, { ...board, actors: [], toRow: 1 });
  const fade = far.ctx.createLinearGradient(0, 96, 0, 300);
  fade.addColorStop(0, "rgba(0, 0, 0, 1)");
  fade.addColorStop(1, "rgba(0, 0, 0, 0)");
  far.ctx.globalCompositeOperation = "destination-out";
  far.ctx.fillStyle = fade;
  far.ctx.fillRect(0, 0, width, 300);
  ctx.drawImage(far.canvas, 0, 0);

  paintArena(ctx, { ...board, floor: false, fromRow: 2 });

  // A lit fuse underlines the wordmark: ember trail, spark, then fresh cord.
  const y = 206;
  const left = 150;
  const right = 874;
  const spark = 512;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.moveTo(spark, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  const ember = ctx.createLinearGradient(left, 0, spark, 0);
  ember.addColorStop(0, rgba(token("--pink"), 0));
  ember.addColorStop(0.55, rgba(token("--pink"), 0.75));
  ember.addColorStop(1, token("--amber"));
  ctx.strokeStyle = ember;
  ctx.shadowColor = token("--amber");
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(spark, y);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, spark, y, 70, token("--amber"), 0.55);
  glow(ctx, spark, y, 26, "#fff7d6", 1);
  const random = seededRandom(42);
  for (let i = 0; i < 16; i += 1) {
    const angle = random() * Math.PI * 2;
    const distance = 14 + random() * 44;
    glow(ctx, spark + Math.cos(angle) * distance, y + Math.sin(angle) * distance * 0.8, 2.5 + random() * 4, i % 3 ? token("--amber") : "#fff7d6", 0.95);
  }
  ctx.restore();

  const wordmark = document.createElement("h1");
  wordmark.className = "wordmark";
  wordmark.textContent = "Neon Fuse";
  wordmark.style.top = "52px";
  wordmark.style.fontSize = "150px";
  stage.append(wordmark);
}

// ---------------------------------------------------------------------------
// Background, 1024x576. Discord draws its own UI over the middle in grid view,
// so the art is the rim of an arena and the centre fades to the bare field.
// ---------------------------------------------------------------------------
function paintBackground(stage) {
  const width = 1024;
  const height = 576;
  const { canvas, ctx } = makeCanvas(width, height);
  stage.append(canvas);
  paintField(ctx, width, height, 1.2);

  const board = {
    rows: [
      "HHHHHHHHHHHHHHHH",
      "H..s........s..H",
      "H.Hs........sH.H",
      "Hs.............H",
      "H..............H",
      "Hs.............H",
      "H.Hs........sH.H",
      "H..s........s..H",
      "HHHHHHHHHHHHHHHH"
    ],
    cell: 64,
    x0: 0,
    y0: 0,
    actors: [
      { kind: "bot", id: "spark", x: 1, y: 1, look: 0.6, you: true },
      { kind: "bomb", own: true, x: 2, y: 1 },
      { kind: "chip", key: "powerup-shield", x: 11, y: 1 },
      { kind: "bot", id: "volt-warden", x: 14, y: 1, look: -0.6 },
      { kind: "bot", id: "circuit-shade", x: 1, y: 4, look: 0.6 },
      { kind: "bot", id: "glitch-bloom", x: 1, y: 7, look: 0.6 },
      { kind: "chip", key: "powerup-speed", x: 4, y: 7 },
      { kind: "bomb", own: false, x: 13, y: 7 },
      { kind: "bot", id: "fuse-rush", x: 14, y: 7, look: -0.6 }
    ]
  };
  const rim = makeCanvas(width, height);
  paintArena(rim.ctx, board);

  // Erase the middle of the board with a soft edge.
  rim.ctx.globalCompositeOperation = "destination-out";
  rim.ctx.filter = "blur(44px)";
  rim.ctx.fillStyle = "#000";
  rim.ctx.beginPath();
  rim.ctx.roundRect(168, 150, width - 336, height - 300, 70);
  rim.ctx.fill();
  ctx.drawImage(rim.canvas, 0, 0);

  // The blast goes on after the fade, so its inner flame stays at full strength.
  paintArena(ctx, {
    ...board,
    floor: false,
    rows: board.rows.map((row) => row.replace(/./g, ".")),
    actors: [{ kind: "blast", x: 14, y: 4, up: 1, down: 1, left: 1, seed: 11 }]
  });
}

const painters = {
  icon: { width: 1024, height: 1024, paint: paintIcon },
  cover: { width: 1024, height: 576, paint: paintCover },
  background: { width: 1024, height: 576, paint: paintBackground }
};

const asset = painters[new URLSearchParams(location.search).get("asset")];
const stage = document.getElementById("stage");
stage.style.width = `${asset.width}px`;
stage.style.height = `${asset.height}px`;

// drawPlayerMarker and the wordmark need Chakra Petch loaded before anything paints.
await Promise.all([500, 600, 700].map((weight) => document.fonts.load(`${weight} 40px "Chakra Petch"`)));
createOverdriveTextures(scene);
asset.paint(stage);
document.documentElement.dataset.ready = "true";
