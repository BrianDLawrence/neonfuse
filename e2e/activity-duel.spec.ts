import { devices, expect, test as base, type FrameLocator, type Page } from "@playwright/test";
import {
  closeActivities,
  fakeUser,
  joinFromAnotherDevice,
  openActivity,
  uniqueInstanceId,
  type ActivityClient
} from "./activity";

const ALICE = fakeUser("Alice Arc", 11);
const BOB = fakeUser("Bob Bolt", 12);

// Each fighter needs its own browser context, as two Discord accounts would; they
// share the test's device so phone runs pit two phones against each other.
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

/** The server's phases in order, without the repeats that ready and connection changes add. */
function phases(client: ActivityClient) {
  return client.serverStates().map((state) => state.phase).filter((phase, index, all) => phase !== all[index - 1]);
}

function roundChip(app: FrameLocator) {
  return app.locator(".duel-header .hud-chip strong");
}

function slot(app: FrameLocator, seat: 0 | 1) {
  return app.locator(`.duel-slot[data-seat="${seat}"]`);
}

function readyButton(app: FrameLocator) {
  return app.locator(".duel-lobby-actions .command-button").first();
}

// The duel replaces the shell, so there is no need to wait for the shell's own arena to boot.
async function enterLobby(client: ActivityClient) {
  await client.app.getByRole("button", { name: "Menu" }).click({ timeout: 15_000 });
  await client.app.locator(".shell-menu-item", { hasText: "Play with a friend" }).click();
  await expect(client.app.getByRole("heading", { name: "Play with a friend" })).toBeVisible();
}

/** Both fighters in one instance's lobby: Alice in seat 1, Bob in seat 2. */
async function seatBoth(page: Page, newPlayerPage: () => Promise<Page>, label: string, { observeBob = false } = {}) {
  const instanceId = uniqueInstanceId(label);
  const alice = await openActivity(page, { instanceId, user: ALICE, participants: [ALICE, BOB] });
  await enterLobby(alice);
  await expect(slot(alice.app, 0)).toContainText(ALICE.displayName);
  await expect(slot(alice.app, 1)).toContainText("Waiting for opponent…");
  await expect(roundChip(alice.app)).toHaveText("waiting");

  const bob = await openActivity(await newPlayerPage(), { instanceId, user: BOB, participants: [ALICE, BOB], observeServer: observeBob });
  await enterLobby(bob);
  for (const client of [alice, bob]) {
    await expect(slot(client.app, 0)).toContainText(ALICE.displayName);
    await expect(slot(client.app, 0)).toContainText("Not ready");
    await expect(slot(client.app, 1)).toContainText(BOB.displayName);
    await expect(slot(client.app, 1)).toContainText("Not ready");
  }
  await expect(alice.app.locator('.duel-player-label[data-seat="0"]')).toContainText(`${ALICE.displayName} (you)`);
  await expect(bob.app.locator('.duel-player-label[data-seat="1"]')).toContainText(`${BOB.displayName} (you)`);
  return { alice, bob, instanceId };
}

/** Both ready up; the server counts down for three seconds and starts the round. */
async function startRound(alice: ActivityClient, bob: ActivityClient) {
  await readyButton(alice.app).click();
  await expect(readyButton(alice.app)).toHaveAttribute("aria-pressed", "true");
  await expect(readyButton(alice.app)).toHaveText("Cancel ready");
  await expect(slot(bob.app, 0)).toContainText("Ready");
  await readyButton(bob.app).click();
  for (const client of [alice, bob]) {
    await expect(roundChip(client.app)).toHaveText("Live", { timeout: 15_000 });
  }
}

async function plantBomb(client: ActivityClient, isPhone: boolean) {
  if (isPhone) {
    await client.app.getByRole("button", { name: "Bomb", exact: true }).tap();
  } else {
    await client.page.keyboard.press("Space");
  }
}

test.describe("Discord Activity duel", () => {
  // Two Activity clients boot two Phaser games, and rounds run on the server's real clock.
  test.beforeEach(() => test.slow());
  test.afterEach(closeActivities);

  test("two fighters take the seats, ready up, count down, play and get a result", async ({ page, newPlayerPage, isMobile }) => {
    const { alice, bob } = await seatBoth(page, newPlayerPage, "round");
    await startRound(alice, bob);

    // Both clients rendered the server's countdown before the round went live.
    for (const client of [alice, bob]) {
      const log = await client.duelLog();
      expect(log.chip).toEqual(expect.arrayContaining(["waiting", "countdown", "Live"]));
      expect(log.chip.indexOf("countdown")).toBeLessThan(log.chip.indexOf("Live"));
      expect(log.countdown.some((text) => text.includes("Get ready!"))).toBe(true);
    }

    // Alice bombs her own spawn and stands still, so the blast decides the round.
    await plantBomb(alice, isMobile);
    await expect(bob.app.locator("#duel-title")).toHaveText("You win!", { timeout: 10_000 });
    await expect(alice.app.locator("#duel-title")).toHaveText("Round over");
    for (const client of [alice, bob]) {
      await expect(roundChip(client.app)).toHaveText("finished");
      await expect(client.app.locator(".duel-copy")).toHaveText("Ready for another round? Both players choose Rematch.");
      await expect(readyButton(client.app)).toHaveText("Rematch");
    }
  });

  test("leaving during play forfeits the round to the fighter who stayed", async ({ page, newPlayerPage }) => {
    const { alice, bob } = await seatBoth(page, newPlayerPage, "forfeit");
    await startRound(alice, bob);

    await bob.app.locator(".duel-header").getByRole("button", { name: "Leave" }).click();
    await expect(bob.app.getByRole("region", { name: "Neon Fuse arena" })).toBeVisible();
    await expect(alice.app.locator("#duel-title")).toHaveText("You win!");
    await expect(alice.app.locator(".duel-copy")).toHaveText("A player left or could not reconnect.");
  });

});

// Reconnects, seat takeover, countdown cancellation and session renewal are socket and
// session behaviour, identical on both device profiles; phone runs keep the round and
// forfeit above, where touch controls and the phone layout differ.
test.describe("Discord Activity duel connection", () => {
  test.skip(({ isMobile }) => isMobile, "protocol behaviour; covered by the desktop project");
  test.beforeEach(() => test.slow());
  test.afterEach(closeActivities);

  test("a dropped socket reconnects inside the grace period and keeps its seat", async ({ page, newPlayerPage }) => {
    const { alice, bob } = await seatBoth(page, newPlayerPage, "grace");
    await startRound(alice, bob);
    expect(alice.ticketRequests()).toBe(1);

    await alice.dropSocket();

    // Bob is told Alice's seat is held; Alice says the round continues while she reconnects.
    await expect.poll(async () => (await bob.duelLog()).banner).toContainEqual(
      expect.stringMatching(/^Opponent reconnecting · 1[0-5]s remaining$/)
    );
    await expect.poll(async () => (await alice.duelLog()).banner).toContain("Reconnecting… The round continues.");
    // A reconnect needs a fresh single-use ticket and a new socket.
    await expect.poll(() => alice.ticketRequests()).toBe(2);
    await expect(roundChip(alice.app)).toHaveText("Live");
    expect(alice.sockets()).toBe(2);

    for (const client of [alice, bob]) {
      await expect(client.app.locator(".duel-connection-banner")).toHaveCount(0);
      await expect(roundChip(client.app)).toHaveText("Live");
      await expect(client.app.locator('.duel-player-label[data-seat="0"]')).toContainText("Connected");
    }
    await expect(alice.app.locator('.duel-player-label[data-seat="0"]')).toContainText(`${ALICE.displayName} (you)`);
    // The round never ended: neither client saw a result screen.
    for (const client of [alice, bob]) {
      expect((await client.duelLog()).chip).not.toContain("finished");
    }
  });

  test("a newer connection takes over the seat, and Retry takes it back", async ({ page, newPlayerPage }) => {
    const { alice, bob, instanceId } = await seatBoth(page, newPlayerPage, "takeover");
    await startRound(alice, bob);

    // Alice's account connects again from another device mid-round, as the realtime
    // server sees it: a fresh, single-use ticket for the same player and instance.
    const aliceAgain = await joinFromAnotherDevice(instanceId, ALICE);
    expect(aliceAgain.joined).toMatchObject({ seat: 0, phase: "playing" });

    // The replaced window gets close code 4009: it explains, offers Retry, and does not reconnect.
    await expect(roundChip(alice.app)).toHaveText("error");
    await expect(alice.app.locator(".duel-notice")).toHaveText("Your match continued in another window or device.");
    await expect(alice.app.getByRole("button", { name: "Retry connection" })).toBeVisible();
    const replaced = (await alice.duelLog()).chip;
    expect(replaced.slice(replaced.lastIndexOf("Live") + 1)).toEqual(["error"]);
    expect(alice.ticketRequests()).toBe(1);

    // The match went on without a forfeit: Bob never saw Alice's seat waiting on a reconnect.
    await expect(roundChip(bob.app)).toHaveText("Live");
    await expect(bob.app.locator('.duel-player-label[data-seat="0"]')).toContainText("Connected");
    expect((await bob.duelLog()).banner).toEqual([]);

    await alice.app.getByRole("button", { name: "Retry connection" }).click();
    await expect(roundChip(alice.app)).toHaveText("Live");
    expect(alice.ticketRequests()).toBe(2);
    // Retry is itself a newer connection, so the other device is the one replaced now.
    expect(await aliceAgain.closed).toBe(4009);
    await expect(roundChip(bob.app)).toHaveText("Live");
  });

  test("a disconnect during the countdown cancels it and clears both ready votes", async ({ page, newPlayerPage }) => {
    const { alice, bob } = await seatBoth(page, newPlayerPage, "countdown", { observeBob: true });

    await readyButton(alice.app).click();
    await expect(slot(bob.app, 0)).toContainText("Ready");
    // Drop Alice the moment the server starts counting down, well inside its three seconds.
    bob.onNextCountdown(() => alice.dropSocket());
    await readyButton(bob.app).click();

    // The server went back to waiting with nobody ready, instead of starting the round.
    await expect.poll(() => phases(bob)).toEqual(["waiting", "countdown", "waiting"]);
    const cancelled = bob.serverStates().find((state, index, all) => state.phase === "waiting" && all[index - 1]?.phase === "countdown");
    expect(cancelled).toMatchObject({ ready: [false, false], connected: [false, true] });

    // Alice reconnects into the waiting lobby; both must ready up again.
    await expect.poll(() => alice.ticketRequests()).toBe(2);
    for (const client of [alice, bob]) {
      await expect(roundChip(client.app)).toHaveText("waiting");
      await expect(slot(client.app, 0)).toContainText("Not ready");
      await expect(slot(client.app, 1)).toContainText("Not ready");
      await expect(readyButton(client.app)).toHaveText("Ready");
      await expect(readyButton(client.app)).toHaveAttribute("aria-pressed", "false");
    }
    expect(phases(bob)).not.toContain("playing");
  });

  test("an expired Activity session is renewed through Discord before joining", async ({ page }) => {
    const client = await openActivity(page, {
      instanceId: uniqueInstanceId("renew"),
      user: ALICE,
      expireFirstSession: true
    });
    await enterLobby(client);

    // The first ticket request gets a 401; the client silently re-authorizes with
    // Discord, exchanges the new code for a new session and retries once.
    await expect(slot(client.app, 0)).toContainText(ALICE.displayName);
    await expect(roundChip(client.app)).toHaveText("waiting");
    expect(client.sessionRequests.map((request) => request.code)).toEqual(["e2e-code-1", "e2e-code-2"]);
    expect(client.sessionTokens).toHaveLength(2);
    expect(client.ticketRequests()).toBe(1);
    await expect(client.app.locator(".duel-notice")).not.toContainText("expired");
  });
});
