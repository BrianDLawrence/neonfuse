import { expect, test, type Page } from "@playwright/test";
import { signIn, stubHighScores, TEST_PILOT } from "./fixtures";

async function openShell(page: Page) {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Neon Fuse arena" }).locator("canvas")).toBeVisible();
}

async function openMenuItem(page: Page, label: string) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator(".shell-menu-item", { hasText: label }).click();
}

function statusChip(page: Page) {
  return page.locator(".hud-chip", { hasText: "Status" }).locator("strong");
}

test.describe("game shell", () => {
  test("a local match counts down, goes live, and lets the player plant a bomb", async ({ page }, testInfo) => {
    // The countdown runs on Phaser's game clock, which crawls under CI's software
    // WebGL (each 650ms tick took about 5s on GitHub runners), so allow extra time.
    test.slow();
    await openShell(page);

    await expect(page.getByRole("button", { name: /Local/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").filter({ hasText: "Get ready" })).toBeVisible();
    await expect(statusChip(page)).toHaveText("Live", { timeout: 60_000 });

    if (testInfo.project.name === "phone") {
      await page.getByRole("button", { name: "Plant bomb" }).tap();
    } else {
      await page.keyboard.press("Space");
    }

    // Planting lights the fuse, which the arena reports as the round status.
    await expect(statusChip(page)).toHaveText("Fuse");
  });

  test("Bot Skirmish swaps the player loadout for bot readouts", async ({ page }) => {
    await openShell(page);

    await page.getByRole("button", { name: /Skirmish/ }).click();

    await expect(page.getByRole("button", { name: /Skirmish/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".bot-hud-chip")).toHaveCount(2);
    await expect(page.locator(".hud-chip", { hasText: "Bombs" })).toHaveCount(0);
  });

  test("the game menu opens with Escape-to-close and returns focus", async ({ page }) => {
    await openShell(page);

    const menuButton = page.getByRole("button", { name: "Menu" });
    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".shell-menu-item").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton).toBeFocused();
  });

  test("Profile falls back to the account name while profile sync is offline", async ({ page }) => {
    await openShell(page);

    await openMenuItem(page, "Profile");

    const profile = page.getByRole("dialog", { name: "Fighter Profile" });
    await expect(profile).toBeVisible();
    await expect(profile.getByRole("heading", { name: TEST_PILOT })).toBeVisible();
    await expect(profile.getByRole("heading", { name: "Match Record" })).toBeVisible();

    await profile.getByRole("button", { name: "Close profile" }).click();
    await expect(profile).toBeHidden();
  });

  test("High Scores lists the leaderboard", async ({ page }) => {
    await stubHighScores(page);
    await openShell(page);

    await openMenuItem(page, "High Scores");

    const scores = page.getByRole("dialog", { name: "High Scores" });
    await expect(scores).toBeVisible();
    await expect(scores.getByText("ACE")).toBeVisible();
    await expect(scores.getByText("4200").or(scores.getByText("4,200"))).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(scores).toBeHidden();
  });

  test("Tracks and Bot Lab open from the menu", async ({ page }) => {
    await openShell(page);

    await openMenuItem(page, "Tracks");
    const tracks = page.getByRole("dialog", { name: "Music" });
    await expect(tracks).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tracks).toBeHidden();

    await openMenuItem(page, "Bots");
    const botLab = page.getByRole("dialog", { name: "Bot Lab" });
    await expect(botLab).toBeVisible();
    await expect(botLab.getByLabel("Bot profile info")).toBeVisible();
    await botLab.getByRole("button", { name: "Close Bot Lab" }).click();
    await expect(botLab).toBeHidden();
  });
});

test.describe("touch layout", () => {
  test.skip(({ isMobile }) => !isMobile, "phone project only");

  test("phones get the D-pad and action buttons", async ({ page }) => {
    await openShell(page);

    const touch = page.getByRole("complementary", { name: "Touch controls" });
    await expect(touch).toBeVisible();
    await expect(touch.getByRole("group", { name: "Move" })).toBeVisible();
    await expect(touch.getByRole("button", { name: "Plant bomb" })).toBeVisible();
    await expect(touch.getByRole("button", { name: "Reset round" })).toBeVisible();
  });
});
