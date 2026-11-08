import { devices, expect, test as base, type FrameLocator, type Page } from "@playwright/test";
import {
  closeActivities,
  fakeUser,
  openActivity,
  partySocket,
  uniqueInstanceId,
  type ActivityClient
} from "./activity";

const ALICE = fakeUser("Alice Arc", 21);
const BOB = fakeUser("Bob Bolt", 22);
const CARO = fakeUser("Caro Coil", 23);
const DEV = fakeUser("Dev Dynamo", 24);
const ERIN = fakeUser("Erin Ember", 25);

// Each browser fighter needs its own context, as separate Discord accounts would.
const test = base.extend<{ newPlayerPage: () => Promise<Page> }>({
  newPlayerPage: async ({ browser, isMobile }, provide) => {
    const device = isMobile ? devices["Pixel 7"] : devices["Desktop Chrome"];
    const contexts: import("@playwright/test").BrowserContext[] = [];
    await provide(async () => {
      const context = await browser.newContext({ ...device });
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  }
});

function roundChip(app: FrameLocator) {
  return app.locator(".duel-header .hud-chip strong");
}

function seat(app: FrameLocator, index: number) {
  return app.locator(`.brawl-seat[data-seat="${index}"]`);
}

function primaryButton(app: FrameLocator) {
  return app.locator(".duel-lobby-actions .command-button").first();
}

async function enterParty(client: ActivityClient) {
  await client.app.getByRole("button", { name: "Menu" }).click({ timeout: 15_000 });
  await client.app.locator(".shell-menu-item", { hasText: "Party Brawl" }).click();
  await expect(client.app.getByRole("heading", { name: "Party Brawl" })).toBeVisible();
}

async function plantBomb(client: ActivityClient, isPhone: boolean) {
  if (isPhone) {
    await client.app.getByRole("button", { name: "Bomb", exact: true }).tap();
  } else {
    await client.page.keyboard.press("Space");
  }
}

/** Alice and Bob in browsers take seats 1 and 2 of a fresh instance's party lobby. */
async function seatBrowsers(page: Page, newPlayerPage: () => Promise<Page>, label: string, everyone = [ALICE, BOB]) {
  const instanceId = uniqueInstanceId(label);
  const alice = await openActivity(page, { instanceId, user: ALICE, participants: everyone });
  await enterParty(alice);
  await expect(seat(alice.app, 0)).toContainText(`${ALICE.displayName} (you)`);
  const bob = await openActivity(await newPlayerPage(), { instanceId, user: BOB, participants: everyone, observeServer: true });
  await enterParty(bob);
  await expect(seat(alice.app, 1)).toContainText(BOB.displayName);
  return { instanceId, alice, bob };
}

test.describe("Discord Activity Party Brawl", () => {
  // Two Activity clients boot two Phaser games, and rounds run on the server's real clock.
  test.beforeEach(() => test.slow());
  test.afterEach(closeActivities);

  test("bots fill the empty seat and four fighters go live", async ({ page, newPlayerPage }) => {
    const { instanceId, alice, bob } = await seatBrowsers(page, newPlayerPage, "brawl-bots", [ALICE, BOB, CARO]);
    const caro = await partySocket(instanceId, CARO);
    for (const client of [alice, bob]) {
      await expect(seat(client.app, 2)).toContainText(CARO.displayName);
      await expect(seat(client.app, 3)).toHaveAttribute("data-kind", "bot");
      await expect(seat(client.app, 3)).toContainText("Glitch Bloom");
    }

    await primaryButton(alice.app).click();
    await expect(primaryButton(alice.app)).toHaveAttribute("aria-pressed", "true");
    await expect(seat(bob.app, 0)).toContainText("Ready");
    caro.ready();
    await primaryButton(bob.app).click();
    for (const client of [alice, bob]) {
      await expect(roundChip(client.app)).toHaveText("Live", { timeout: 15_000 });
      await expect(client.app.locator('.brawl-scoreboard-seat[data-seat="3"]')).toHaveAttribute("data-kind", "bot");
      await expect(client.app.locator('.brawl-scoreboard-seat[data-seat="3"]')).toContainText("Glitch Bloom");
    }
    const live = await caro.waitFor((state) => state.phase === "playing");
    expect(live.duel?.players).toHaveLength(4);
    expect(live.mode === "party" && live.fighters?.map((fighter) => fighter.kind)).toEqual(["human", "human", "human", "bot"]);
    // Bots finish rounds on their own clock, so the test never waits for one to end.
  });

  test("a best-of-three round ends, a newcomer takes the free seat, and round two needs fresh votes", async ({ page, newPlayerPage, isMobile }) => {
    const everyone = [ALICE, BOB, CARO, DEV, ERIN];
    const { instanceId, alice, bob } = await seatBrowsers(page, newPlayerPage, "brawl-series", everyone);
    const caro = await partySocket(instanceId, CARO);
    const dev = await partySocket(instanceId, DEV);
    await expect(seat(alice.app, 3)).toContainText(DEV.displayName);

    // Four people, so no bots: the round's outcome is fully scripted.
    await primaryButton(alice.app).click();
    await expect(seat(bob.app, 0)).toContainText("Ready");
    await primaryButton(bob.app).click();
    caro.ready();
    dev.ready();
    for (const client of [alice, bob]) await expect(roundChip(client.app)).toHaveText("Live", { timeout: 15_000 });

    // Alice, Bob and Caro bomb their own corners and stand still; Dev stays out of range.
    // Alice goes first, and the others plant once she is out, so she watches their fuses burn.
    await plantBomb(alice, isMobile);
    await caro.waitFor((state) => state.duel?.players[0].alive === false);
    await plantBomb(bob, isMobile);
    caro.bomb();
    await expect(alice.app.locator("#duel-title")).toHaveText(`${DEV.displayName} wins round 1`, { timeout: 15_000 });
    await expect(alice.app.locator(".brawl-out-banner")).toHaveCount(0);
    expect((await alice.duelLog()).banner).toContain("You're out. Watching the rest of the round.");
    await expect(seat(alice.app, 3).locator('.brawl-fuse-segment[data-lit="true"]')).toHaveCount(1);
    await expect(primaryButton(alice.app)).toHaveText("Next round");
    const result = await dev.waitFor((state) => state.phase === "finished");
    expect(result.mode === "party" && result.series).toMatchObject({ rounds: 1, wins: [0, 0, 0, 1], outcome: null });

    // Dev leaves: the seat falls back to its bot and Dev's win leaves with them.
    await dev.leave();
    await expect(seat(alice.app, 3)).toHaveAttribute("data-kind", "bot");
    await expect(seat(alice.app, 3).locator('.brawl-fuse-segment[data-lit="true"]')).toHaveCount(0);
    // Erin joins between rounds and takes that seat with a fresh record.
    const erin = await partySocket(instanceId, ERIN);
    expect(erin.latest()?.seat).toBe(3);
    await expect(seat(alice.app, 3)).toContainText(ERIN.displayName);
    await expect(seat(alice.app, 3).locator('.brawl-fuse-segment[data-lit="true"]')).toHaveCount(0);

    // One vote is not enough; every seated person chooses Next round.
    await primaryButton(alice.app).click();
    await expect(primaryButton(alice.app)).toHaveText("Cancel ready");
    caro.ready();
    erin.ready();
    await expect(seat(alice.app, 1)).toContainText("Not ready");
    expect(bob.serverStates().at(-1)?.phase).toBe("finished");
    await primaryButton(bob.app).click();
    for (const client of [alice, bob]) await expect(roundChip(client.app)).toHaveText("Live", { timeout: 15_000 });
    const phases = bob.serverStates().map((state) => state.phase).filter((phase, index, all) => phase !== all[index - 1]);
    expect(phases).toEqual(expect.arrayContaining(["waiting", "countdown", "playing", "finished"]));
    expect(phases.lastIndexOf("countdown")).toBeGreaterThan(phases.indexOf("finished"));
  });
});
