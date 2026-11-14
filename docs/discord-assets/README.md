# Discord Developer Portal artwork

The four files the portal asks for, made from Neon Fuse's own art: the `:root`
colour tokens in `src/app/globals.css`, the Chakra Petch display font in
`src/app/fonts`, the Fusebots in `src/game/presentation/fusebotArt.ts`, and the
arena blocks, bombs and blast flames in `src/game/presentation/overdriveTextures.ts`.
Uploading them is a manual step in the portal.

| File | Size | Portal slot | Limit |
| --- | --- | --- | --- |
| `app-icon.png` | 1024×1024 PNG, 595 KB | General Information → App Icon | 1024×1024 |
| `cover-art.png` | 1024×576 PNG, 355 KB | Activities → Art Assets → Cover Art | 1024×576, under 10 MB |
| `background.png` | 1024×576 PNG, 387 KB | Activities → Art Assets → Background | 1024×576, under 10 MB |
| `video-preview.mp4` | 640×360 H.264, 10.0 s, 30 fps, no sound, 411 KB | Activities → Art Assets → Video Preview | 640×360, 10 s, under 0.5 MB |

What each one shows:

- **App icon**: Spark, the player's Fusebot, from the chest up. One shape, so it
  still reads at 32px inside Discord's round mask.
- **Cover art**: the "Neon Fuse" wordmark, underlined by a lit fuse, over the
  bottom rows of an arena with Spark, a planted bomb and the four rival Fusebots.
- **Background**: the rim of an arena with the Fusebots in the corners. The
  middle fades to the bare field, because Discord draws its own UI there in grid view.
- **Video preview**: the first ten seconds of a real Versus round against Fuse
  Rush, from the "Fuse!" banner to a double blast.

## Regenerating

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node docs/discord-assets/generate.mjs
```

Add `stills` or `clip` to make only that part. Nothing new is installed: the
script uses Playwright and TypeScript, which the repo already depends on.

- **Stills** are painted by `generator/stills.js` in a Chrome page. The script
  serves that page the game's own art modules (transpiled on request), so a
  change to a Fusebot or a block shows up here on the next run. The three PNGs
  come out byte-for-byte the same each run.
- **The clip** plays a scripted opening in the offline test build (`.next-e2e`,
  built on first use, served on port 3217; `DISCORD_ASSETS_PORT` changes it),
  with the signed-in session stubbed as in `e2e/fixtures.ts`. Chrome's screencast
  supplies the frames and `generator/encode.html` encodes them to H.264 with
  Chrome's built-in encoder, stepping the bitrate down until the file is under
  500,000 bytes. This needs Google Chrome; Playwright's own Chromium has no H.264
  encoder. Bot moves vary a little, so each run gives a slightly different clip.
- Playwright's `recordVideo` and a system `ffmpeg` were both unavailable on the
  machine these were made on, which is why the clip is built this way. If Chrome
  cannot encode and `ffmpeg` is on the PATH, the script falls back to it; that
  path has not been run.
- Set `DISCORD_ASSETS_KEEP_RECORDING=1` to keep the captured frames, and
  `DISCORD_ASSETS_RECORDING=<that folder>` to re-encode them without replaying.
