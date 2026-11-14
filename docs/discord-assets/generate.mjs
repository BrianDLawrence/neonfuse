#!/usr/bin/env node
// Regenerates the Discord Developer Portal artwork in this folder.
//
//   node docs/discord-assets/generate.mjs            # stills and clip
//   node docs/discord-assets/generate.mjs stills     # app-icon.png, cover-art.png, background.png
//   node docs/discord-assets/generate.mjs clip       # video-preview.mp4
//
// Uses only what the repo already depends on: Playwright to drive Chrome and
// TypeScript to hand the game's own art modules to the stills page. Set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to a local Chrome, as for `npm run test:e2e`.
// See README.md in this folder for what each file is for.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const generator = join(here, "generator");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

/**
 * A made-up origin: every request to it is answered from the repo by serveRepoFile().
 * It is https because Chrome only offers its video encoder to secure pages.
 */
const ORIGIN = "https://neon-fuse-assets.test";
const MIME = { html: "text/html", js: "text/javascript", ts: "text/javascript", woff2: "font/woff2", jpg: "image/jpeg", mp4: "video/mp4" };

const STILLS = [
  { asset: "icon", file: "app-icon.png", width: 1024, height: 1024 },
  { asset: "cover", file: "cover-art.png", width: 1024, height: 576 },
  { asset: "background", file: "background.png", width: 1024, height: 576 }
];

const CLIP = { file: "video-preview.mp4", width: 640, height: 360, seconds: 10, fps: 30, maxBytes: 500_000 };
const APP_PORT = Number(process.env.DISCORD_ASSETS_PORT || 3217);
const DIST_DIR = ".next-e2e";

/** The design tokens, read from the app's stylesheet so the art cannot drift from it. */
function rootTokens() {
  const css = readFileSync(join(repo, "src/app/globals.css"), "utf8");
  const block = css.match(/:root\s*\{[^}]*\}/);
  if (!block) throw new Error("No :root block found in src/app/globals.css");
  return block[0];
}

/** Turns a game module into browser JavaScript; type-only imports such as Phaser drop out. */
function transpile(file) {
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  });
  if (/from\s+["']phaser["']/.test(outputText)) {
    throw new Error(`${file} uses Phaser at runtime, so the stills page cannot load it.`);
  }
  return outputText.replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, "$1$2.ts$3");
}

async function serveRepoFile(route, extraFile = () => null) {
  const { pathname } = new URL(route.request().url());
  const name = pathname.slice(1);
  const extension = name.split(".").pop();
  const contentType = MIME[extension] ?? "application/octet-stream";

  const extra = extraFile(name);
  if (extra) return route.fulfill({ contentType, body: readFileSync(extra) });
  if (name === "stills.html") {
    const html = readFileSync(join(generator, name), "utf8").replace("/*ROOT_TOKENS*/", rootTokens());
    return route.fulfill({ contentType, body: html });
  }
  if (name === "stills.js" || name === "encode.html") return route.fulfill({ contentType, body: readFileSync(join(generator, name)) });
  if (name.startsWith("fonts/")) return route.fulfill({ contentType, body: readFileSync(join(repo, "src/app", name)) });
  if (name.startsWith("src/") && extension === "ts") return route.fulfill({ contentType, body: transpile(join(repo, name)) });
  return route.fulfill({ status: 404, body: `Not served: ${name}` });
}

async function makeStills(browser) {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  await context.route(`${ORIGIN}/**`, (route) => serveRepoFile(route));

  for (const still of STILLS) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: still.width, height: still.height });
    await page.goto(`${ORIGIN}/stills.html?asset=${still.asset}`);
    await page.waitForSelector("html[data-ready=true]", { timeout: 30_000 }).catch(() => {
      throw new Error(`${still.file} did not finish painting: ${errors.join("; ") || "no page error reported"}`);
    });
    await page.screenshot({
      path: join(here, still.file),
      clip: { x: 0, y: 0, width: still.width, height: still.height }
    });
    await page.close();
    console.log(`${still.file}  ${still.width}x${still.height}  ${statSync(join(here, still.file)).size} bytes`);
  }

  await context.close();
}

// ---------------------------------------------------------------------------
// Video preview
// ---------------------------------------------------------------------------

async function isUp(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

/** Builds the same offline bundle the browser tests use (if missing) and serves it. */
async function startApp() {
  const env = {
    ...process.env,
    NEXT_DIST_DIR: DIST_DIR,
    // Fake public values, as in playwright.config.ts; the clip never reaches Discord or the realtime server.
    NEXT_PUBLIC_DISCORD_CLIENT_ID: "100000000000000001",
    NEXT_PUBLIC_MULTIPLAYER_URL: "ws://127.0.0.1:3101/multiplayer"
  };

  if (!existsSync(join(repo, DIST_DIR, "BUILD_ID"))) {
    console.log(`Building the app into ${DIST_DIR} ...`);
    const build = spawnSync(process.execPath, ["e2e/build-app.mjs"], { cwd: repo, env, stdio: "inherit" });
    if (build.status !== 0) throw new Error("The app build failed.");
  }

  const url = `http://localhost:${APP_PORT}`;
  if (await isUp(url)) throw new Error(`Port ${APP_PORT} is already in use; set DISCORD_ASSETS_PORT to a free one.`);
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)], {
    cwd: repo,
    env,
    stdio: "ignore"
  });
  for (let attempt = 0; attempt < 120 && !(await isUp(url)); attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
  }
  if (!(await isUp(url))) {
    server.kill();
    throw new Error("The app server did not start.");
  }
  return { url, stop: () => server.kill() };
}

/**
 * Plays the opening of a real Versus round and returns what Chrome drew, as
 * timestamped JPEG frames. Playwright's own recordVideo needs a separate ffmpeg
 * download, so the frames come from Chrome's screencast instead.
 */
async function recordRound(browser, appUrl) {
  const size = { width: 1280, height: 720 };
  const dir = mkdtempSync(join(tmpdir(), "neon-fuse-clip-"));
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });

  // A signed-in returning player, stubbed the same way as e2e/fixtures.ts.
  const now = new Date().toISOString();
  await context.addInitScript(() => window.localStorage.setItem("neon-fuse:how-to-play-seen", "1"));
  await context.route("**/api/auth/get-session*", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "clip-session",
          userId: "clip-user",
          token: "clip-token",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          createdAt: now,
          updatedAt: now
        },
        user: {
          id: "clip-user",
          name: "Spark",
          email: "pilot@example.test",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now
        }
      }
    })
  );

  const page = await context.newPage();
  await page.goto(appUrl);
  await page.getByRole("region", { name: "Neon Fuse arena" }).locator("canvas").waitFor();

  const frames = [];
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const name = `${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(join(dir, name), Buffer.from(data, "base64"));
    frames.push({ name, time: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: size.width, maxHeight: size.height });

  const status = page.locator(".hud-chip", { hasText: "Status" }).locator("strong");
  await status.filter({ hasText: /^Live$/ }).waitFor({ timeout: 60_000 });
  const liveAt = Date.now() / 1000;

  const tap = async (key, times = 1) => {
    for (let i = 0; i < times; i += 1) {
      await page.keyboard.press(key, { delay: 45 });
      await page.waitForTimeout(95);
    }
  };
  // The fuse burns for 1.4s; by the end of this wait the blast has gone off.
  const waitForBlast = () => page.waitForTimeout(1500);

  // Spark starts in the top-left corner. Each pass walks further along the top
  // row, plants a bomb at the next crate, and ducks back around the corner.
  for (let reach = 1; reach <= 3; reach += 1) {
    await tap("ArrowRight", reach);
    await tap("Space");
    await tap("ArrowLeft", reach);
    await tap("ArrowDown");
    await waitForBlast();
    await tap("ArrowUp");
  }
  // Then one down the left column, escaping back along the top row.
  await tap("ArrowDown", 2);
  await tap("Space");
  await tap("ArrowUp", 2);
  await tap("ArrowRight");
  await waitForBlast();
  await page.waitForTimeout(1500);

  await cdp.send("Page.stopScreencast");
  await context.close();
  writeFileSync(join(dir, "recording.json"), JSON.stringify({ frames, liveAt }));
  return { dir, frames, liveAt };
}

function hasFfmpeg() {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}

async function makeClip(browser) {
  // DISCORD_ASSETS_RECORDING=<folder kept from an earlier run> re-encodes that round without replaying it.
  const reuse = process.env.DISCORD_ASSETS_RECORDING;
  const keep = reuse || process.env.DISCORD_ASSETS_KEEP_RECORDING;
  let recording;
  if (reuse) {
    recording = { dir: reuse, ...JSON.parse(readFileSync(join(reuse, "recording.json"), "utf8")) };
  } else {
    const app = await startApp();
    try {
      recording = await recordRound(browser, app.url);
    } finally {
      app.stop();
    }
  }
  // Open on the "Fuse!" banner, just before the round goes live. Chrome only sends a
  // frame when the picture changes, so each output frame shows the newest one so far.
  const start = recording.liveAt - 0.35;
  const last = recording.frames[recording.frames.length - 1];
  if (!last || last.time < start + CLIP.seconds) throw new Error("The recording is shorter than the clip.");
  const names = [];
  let latest = 0;
  for (let index = 0; index < CLIP.seconds * CLIP.fps; index += 1) {
    const time = start + index / CLIP.fps;
    while (latest + 1 < recording.frames.length && recording.frames[latest + 1].time <= time) latest += 1;
    names.push(`raw/${recording.frames[latest].name}`);
  }
  const out = join(here, CLIP.file);
  console.log(`Recorded ${recording.frames.length} frames of play; the clip uses ${new Set(names).size}.`);

  const context = await browser.newContext();
  await context.route(`${ORIGIN}/**`, (route) =>
    serveRepoFile(route, (name) => (name.startsWith("raw/") ? join(recording.dir, name.slice(4)) : name === "clip.mp4" ? out : null))
  );
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/encode.html`);

  let done = false;
  for (let bitrate = 330_000; bitrate >= 120_000 && !done; bitrate = Math.round(bitrate * 0.88)) {
    const result = await page.evaluate((options) => window.encodeClip(options), {
      frames: names.map((name) => `/${name}`),
      fps: CLIP.fps,
      width: CLIP.width,
      height: CLIP.height,
      bitrate
    });

    if (result.error === "no-h264") {
      // Playwright's own Chromium ships without an H.264 encoder; Google Chrome has one.
      if (!hasFfmpeg()) {
        throw new Error(
          `This browser cannot encode H.264 and ffmpeg is not installed. Point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH at Google Chrome, or build the clip by hand from the frames in ${recording.dir}.`
        );
      }
      // Not exercised on the machine these assets were made on (it had no ffmpeg).
      const list = join(recording.dir, "frames.txt");
      const entry = (name) => `file '${join(recording.dir, name.slice(4))}'\nduration ${1 / CLIP.fps}`;
      writeFileSync(list, names.map(entry).join("\n"));
      const ffmpeg = spawnSync(
        "ffmpeg",
        ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-vf", `scale=${CLIP.width}:${CLIP.height}`]
          .concat(["-r", String(CLIP.fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-b:v", String(bitrate), "-maxrate", String(bitrate)])
          .concat(["-bufsize", String(bitrate * 2), "-movflags", "+faststart", out]),
        { stdio: "inherit" }
      );
      if (ffmpeg.status !== 0) throw new Error("ffmpeg failed.");
      done = statSync(out).size < CLIP.maxBytes;
      continue;
    }

    console.log(`  ${result.codec} at ${Math.round(bitrate / 1000)} kbps: ${result.bytes} bytes`);
    if (result.bytes < CLIP.maxBytes) {
      writeFileSync(out, Buffer.from(result.base64, "base64"));
      done = true;
    }
  }
  if (!done) throw new Error(`Could not get the clip under ${CLIP.maxBytes} bytes.`);

  // Read it back through the browser's decoder to confirm it plays at the right size and length.
  const probe = await page.evaluate((src) => window.probeClip(src), "/clip.mp4");
  await context.close();
  if (keep) console.log(`Raw frames kept in ${recording.dir}`);
  else rmSync(recording.dir, { recursive: true, force: true });

  console.log(`${CLIP.file}  ${probe.width}x${probe.height}  ${probe.duration.toFixed(2)}s  ${statSync(out).size} bytes`);
  if (probe.width !== CLIP.width || probe.height !== CLIP.height || Math.abs(probe.duration - CLIP.seconds) > 0.05) {
    throw new Error("The finished clip does not match the portal's size or length.");
  }
}

const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !["stills", "clip"].includes(name));
if (unknown.length) {
  console.error(`Unknown target: ${unknown.join(", ")}. Use "stills", "clip", or nothing for both.`);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath });
try {
  if (!wanted.length || wanted.includes("stills")) await makeStills(browser);
  if (!wanted.length || wanted.includes("clip")) await makeClip(browser);
} finally {
  await browser.close();
}

console.log(`Done. Files are in ${here}:`);
for (const name of readdirSync(here).filter((file) => /\.(png|mp4)$/.test(file))) console.log(`  ${name}`);
