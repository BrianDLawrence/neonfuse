import { defineConfig, devices } from "@playwright/test";
import {
  APP_PORT,
  E2E_DISCORD_CLIENT_ID,
  E2E_MULTIPLAYER_SECRET,
  E2E_MULTIPLAYER_URL,
  REALTIME_PORT
} from "./e2e/environment";

const baseURL = `http://localhost:${APP_PORT}`;
// Point at a preinstalled Chromium when the bundled browser is not downloaded.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const DUEL_SPEC = /activity-duel\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: { executablePath }
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: DUEL_SPEC },
    { name: "phone", use: { ...devices["Pixel 7"] }, testIgnore: DUEL_SPEC },
    // A duel test drives two software-rendered Phaser games, so these run one at a time
    // per device instead of crowding out the rest of the suite.
    { name: "desktop-duel", use: { ...devices["Desktop Chrome"] }, testMatch: DUEL_SPEC, workers: 1 },
    { name: "phone-duel", use: { ...devices["Pixel 7"] }, testMatch: DUEL_SPEC, workers: 1 }
  ],
  webServer: [
    {
      // A production build of the app in its own distDir, with fake public Discord and
      // realtime settings baked in, so the `npm run build` output stays as shipped.
      command: `node e2e/build-app.mjs && node node_modules/next/dist/bin/next start -p ${APP_PORT}`,
      url: `${baseURL}/api/music/tracks`,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_DISCORD_CLIENT_ID: E2E_DISCORD_CLIENT_ID,
        NEXT_PUBLIC_MULTIPLAYER_URL: E2E_MULTIPLAYER_URL
      },
      reuseExistingServer: !process.env.CI,
      timeout: 240_000
    },
    {
      // The compiled realtime server from `npm run build`, with a test-only secret and no MongoDB.
      command: "node dist/realtime/server/index.js",
      url: `http://127.0.0.1:${REALTIME_PORT}/health`,
      env: {
        PORT: String(REALTIME_PORT),
        MULTIPLAYER_SECRET: E2E_MULTIPLAYER_SECRET,
        MONGODB_URI: ""
      },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    }
  ]
});
