import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://localhost:${port}`;
// Point at a preinstalled Chromium when the bundled browser is not downloaded.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;

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
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } }
  ],
  // Runs the production build, so `npm run build` must come first.
  webServer: {
    command: `npm run start -- -p ${port}`,
    url: `${baseURL}/api/music/tracks`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
