import { expect, test, type Page } from "@playwright/test";
import { getDailyChallenge, getDailyOpponents, type DailyChallenge } from "@/game/simulation/daily";
import { bannerCaptions, recordRoundStatuses, roundStatuses, signIn, stubHighScores, TEST_PILOT } from "./fixtures";

// Daily Fuse tests pin the page clock, so the expected challenge never shifts at
// midnight UTC. The day is in the past so the stubbed session stays unexpired.
const DAILY_DAY = "2026-03-14";
const DAILY_CHALLENGE = getDailyChallenge(DAILY_DAY) as DailyChallenge;

async function pinDailyClock(page: Page) {
  await page.clock.setFixedTime(new Date(`${DAILY_DAY}T15:00:00Z`));
}

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
    await recordRoundStatuses(page);
    await openShell(page);

    await expect(page.getByRole("button", { name: "Versus" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => roundStatuses(page), { timeout: 60_000 }).toContain("Live");
    // Each tick lasts 650ms of arena time, so check the recorded sequence rather than
    // racing the banner: it counted down 3-2-1 under "Get ready" before going live.
    // Bots may already have reported "Danger" by now, so compare the opening only.
    const beforePlant = await roundStatuses(page);
    expect(beforePlant.slice(0, 6)).toEqual(["Warmup", "3", "2", "1", "Fuse!", "Live"]);
    expect((await bannerCaptions(page)).slice(0, 4)).toEqual(["3 Get ready", "2 Get ready", "1 Get ready", "Fuse!"]);

    if (testInfo.project.name === "phone") {
      await page.getByRole("button", { name: "Plant bomb" }).tap();
    } else {
      await page.keyboard.press("Space");
    }

    // Planting lights the fuse, which the arena reports as the round status. The fuse
    // burns for 1.4s and a bot may report "Danger" first, so read the recorded log.
    // Only the player's bomb reports "Fuse"; bot bombs report "Danger".
    await expect.poll(async () => (await roundStatuses(page)).slice(beforePlant.length)).toContain("Fuse");
  });

  test("Versus opens an opponent picker and starts a fight with the chosen bot", async ({ page }) => {
    await openShell(page);

    await page.getByRole("button", { name: "Versus" }).click();
    const versus = page.getByRole("dialog", { name: "Versus" });
    await expect(versus).toBeVisible();

    const roster = versus.getByRole("group", { name: "Opponents" });
    await expect(roster.getByRole("button")).toHaveCount(4);
    await roster.getByRole("button", { name: /Volt Warden/ }).click();
    await expect(versus.getByRole("button", { name: /Overclocked/ })).toBeDisabled();
    await expect(versus.getByText("Clear campaign stage 2-3 to unlock.")).toBeVisible();

    await versus.getByRole("button", { name: "Fight Volt Warden" }).click();

    await expect(versus).toBeHidden();
    await expect(page.getByRole("button", { name: "Versus" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".key-chip", { hasText: "Goal" })).toContainText("Blast Volt Warden");
  });

  test("clearing a bot's Act 2 stage unlocks its Overclocked variant in Versus", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "neon-fuse:campaign-progress",
        JSON.stringify({ stages: { "2-3": { stars: 1, bestTimeMs: 90_000 } } })
      );
    });
    await openShell(page);

    await page.getByRole("button", { name: "Versus" }).click();
    const versus = page.getByRole("dialog", { name: "Versus" });
    const roster = versus.getByRole("group", { name: "Opponents" });

    await expect(roster.getByRole("button", { name: /Volt Warden/ })).toContainText("Overclock ready");
    await expect(roster.getByRole("button", { name: /Fuse Rush/ })).not.toContainText("Overclock ready");

    await roster.getByRole("button", { name: /Volt Warden/ }).click();
    const overclock = versus.getByRole("button", { name: /Overclocked/ });
    await overclock.click();
    await expect(overclock).toHaveAttribute("aria-pressed", "true");
    await versus.getByRole("button", { name: "Fight Volt Warden" }).click();

    await expect(page.locator(".key-chip", { hasText: "Goal" })).toContainText("Blast Volt Warden (Overclocked)");
  });

  test("Bot Skirmish swaps the player loadout for bot readouts", async ({ page }) => {
    await openShell(page);

    await page.getByRole("button", { name: /Skirmish/ }).click();

    await expect(page.getByRole("button", { name: /Skirmish/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".bot-hud-chip")).toHaveCount(2);
    await expect(page.locator(".hud-chip", { hasText: "Bombs" })).toHaveCount(0);
  });

  test("Campaign opens on stage 1-1, keeps 1-2 locked, and starts the stage", async ({ page }) => {
    await openShell(page);

    await page.getByRole("button", { name: "Campaign" }).click();

    const campaign = page.getByRole("dialog", { name: "Campaign" });
    await expect(campaign).toBeVisible();

    const ladder = campaign.getByRole("list", { name: "Act 1 stages" });
    const firstStage = ladder.getByRole("button", { name: /1-1/ });
    const secondStage = ladder.getByRole("button", { name: /1-2/ });
    await expect(firstStage).toHaveAttribute("data-state", "next");
    await expect(firstStage).toHaveAttribute("aria-pressed", "true");
    await expect(secondStage).toHaveAttribute("data-state", "locked");

    await secondStage.click();
    await expect(campaign.getByText("Clear stage 1-1 to unlock this stage.")).toBeVisible();
    await expect(campaign.getByRole("button", { name: "Start stage" })).toBeDisabled();

    await firstStage.click();
    await campaign.getByRole("button", { name: "Start stage" }).click();

    await expect(campaign).toBeHidden();
    await expect(page.getByRole("button", { name: "Campaign" })).toHaveAttribute("aria-pressed", "true");
    const stageChip = page.locator(".hud-chip-stage");
    await expect(stageChip).toContainText("Stage 1-1");
    await expect(stageChip).toContainText("Fuse Rush");
  });

  test("Act 2 stays locked until Act 1 is cleared", async ({ page }) => {
    await openShell(page);

    await page.getByRole("button", { name: "Campaign" }).click();
    const campaign = page.getByRole("dialog", { name: "Campaign" });
    const acts = campaign.getByRole("group", { name: "Acts" });

    await expect(acts.getByRole("button", { name: /Act 2/ })).toHaveAttribute("data-locked", "true");
    await acts.getByRole("button", { name: /Act 2/ }).click();

    await expect(campaign.getByRole("list", { name: "Act 2 stages" })).toBeVisible();
    await expect(campaign.getByText(/Clear Act 1 \(finish stage 1-4\)/)).toBeVisible();
    await expect(campaign.getByRole("button", { name: "Start stage" })).toBeDisabled();
  });

  test("the Act 2 gauntlet puts two bots on the board", async ({ page }) => {
    await page.addInitScript(() => {
      const cleared = { stars: 1, bestTimeMs: 90_000 };
      window.localStorage.setItem(
        "neon-fuse:campaign-progress",
        JSON.stringify({
          stages: {
            "1-1": cleared,
            "1-2": cleared,
            "1-3": cleared,
            "1-4": cleared,
            "2-1": cleared,
            "2-2": cleared,
            "2-3": cleared,
            "2-4": cleared
          }
        })
      );
    });
    await openShell(page);

    await page.getByRole("button", { name: "Campaign" }).click();
    const campaign = page.getByRole("dialog", { name: "Campaign" });
    const gauntlet = campaign.getByRole("list", { name: "Act 2 stages" }).getByRole("button", { name: /2-5/ });

    await expect(gauntlet).toHaveAttribute("data-state", "next");
    await expect(campaign.locator(".trait-pill", { hasText: "Format" })).toContainText("1v2");
    await campaign.getByRole("button", { name: "Start stage" }).click();

    await expect(page.locator(".hud-chip-stage")).toContainText("Gauntlet");
    await expect(page.locator(".hud-chip-bots")).toContainText("2/2");
  });

  test("Act 3 opens Megagrid stages on boards bigger than the standard arena", async ({ page }) => {
    await page.addInitScript(() => {
      const cleared = { stars: 1, bestTimeMs: 90_000 };
      const ids = ["1-1", "1-2", "1-3", "1-4", "2-1", "2-2", "2-3", "2-4", "2-5"];
      window.localStorage.setItem(
        "neon-fuse:campaign-progress",
        JSON.stringify({ stages: Object.fromEntries(ids.map((id) => [id, cleared])) })
      );
    });
    await openShell(page);

    await page.getByRole("button", { name: "Campaign" }).click();
    const campaign = page.getByRole("dialog", { name: "Campaign" });

    await expect(campaign.getByRole("group", { name: "Acts" }).getByRole("button", { name: /Act 3/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(campaign.getByRole("list", { name: "Act 3 stages" }).getByRole("button", { name: /3-1/ })).toHaveAttribute(
      "data-state",
      "next"
    );
    await expect(campaign.locator(".trait-pill", { hasText: "Board" })).toContainText("19×15");
    await campaign.getByRole("button", { name: "Start stage" }).click();

    await expect(page.locator(".hud-chip-stage")).toContainText("Stage 3-1");
    await expect(statusChip(page)).toHaveText(/^[123]$|Fuse!|Live/);
  });

  test("Daily Fuse opens today's briefing from the game menu and starts the round", async ({ page }) => {
    await pinDailyClock(page);
    await openShell(page);

    await openMenuItem(page, "Daily Fuse");

    const daily = page.getByRole("dialog", { name: "Daily Fuse" });
    await expect(daily).toBeVisible();
    await expect(daily.locator(".daily-modifier-label")).toHaveText(DAILY_CHALLENGE.modifier.label);
    for (const bot of getDailyOpponents(DAILY_CHALLENGE)) {
      await expect(daily.getByRole("heading", { level: 4 })).toContainText(bot.name);
    }
    await expect(daily.locator(".trait-pill", { hasText: "Board" })).toContainText(
      `${DAILY_CHALLENGE.arena.cols}×${DAILY_CHALLENGE.arena.rows}`
    );
    await expect(daily.locator(".daily-status")).toContainText("Not cleared yet");
    await expect(daily.locator(".daily-note")).toContainText("unranked");

    await daily.getByRole("button", { name: "Play today's fuse" }).click();

    await expect(daily).toBeHidden();
    const chip = page.locator(".hud-chip-daily");
    await expect(chip).toContainText("Daily Fuse");
    await expect(chip).toContainText(DAILY_CHALLENGE.modifier.label);
    await expect(statusChip(page)).toHaveText(/^Warmup$|^[123]$|Fuse!|Live/);
  });

  test("Daily Fuse shows a stored streak and today's clear", async ({ page }) => {
    await page.addInitScript((day) => {
      window.localStorage.setItem(
        "neon-fuse:daily-progress",
        JSON.stringify({
          totalClears: 5,
          longestStreak: 4,
          runLength: 3,
          lastClearedKey: day,
          bestTimeMs: 41_000,
          recent: { [day]: 52_000 }
        })
      );
    }, DAILY_DAY);
    await pinDailyClock(page);
    await openShell(page);

    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.locator(".shell-menu-item", { hasText: "Daily Fuse" })).toContainText("Streak 3");
    await page.locator(".shell-menu-item", { hasText: "Daily Fuse" }).click();

    const daily = page.getByRole("dialog", { name: "Daily Fuse" });
    await expect(daily.locator(".daily-streak-count")).toHaveText("3");
    await expect(daily.locator(".daily-status")).toContainText("Cleared today in 0:52");
    await expect(daily.locator(".trait-pill", { hasText: "Longest" })).toContainText("4 days");
    await expect(daily.getByRole("button", { name: "Replay today's fuse" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(daily).toBeHidden();
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

    const achievements = profile.getByLabel("Achievement progress");
    for (const name of ["Ladder Climber", "Overclocked", "Megagrid"]) {
      await expect(achievements.getByText(name, { exact: true })).toBeVisible();
    }

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
