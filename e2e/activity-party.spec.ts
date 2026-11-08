import { expect, test } from "@playwright/test";
import type { PlayerProgression } from "@/game/simulation/progression";
import { DEFAULT_PROFILE_PREFERENCES, EMPTY_PROFILE_MATCH_STATS, type PlayerProfile } from "@/lib/player-profile-types";
import { closeActivities, expectShell, fakeUser, openActivity, partyMember, uniqueInstanceId } from "./activity";

const PILOT = fakeUser("Nova Pilot", 1);
const FRIEND = fakeUser("Rook Runner", 2);
const LATECOMER = fakeUser("Ziggy Spark", 3);

// Phones keep the party link in the menu, so read it whether or not it is displayed.
function partyLink(app: import("@playwright/test").FrameLocator) {
  return app.locator(".account-context");
}

// The dialog's "N connected" count is hidden on phones but still rendered.
function connectedCount(party: import("@playwright/test").Locator) {
  return party.locator(".admin-panel-header-actions > span");
}

async function openParty(app: import("@playwright/test").FrameLocator) {
  await app.getByRole("button", { name: "Menu" }).click();
  await app.locator(".shell-menu-item", { hasText: "Discord party" }).click();
  return app.getByRole("dialog", { name: "Discord Party" });
}

test.describe("Discord Activity", () => {
  test.afterEach(closeActivities);

  test("an Activity launch signs in through the Discord SDK without a web session", async ({ page }) => {
    const instanceId = uniqueInstanceId("signin");
    const client = await openActivity(page, { instanceId, user: PILOT, participants: [PILOT, FRIEND] });

    await expectShell(client);
    await expect(partyLink(client.app)).toHaveText("Discord Party 2");
    await expect(client.app.locator(".profile-trigger")).toContainText(PILOT.displayName);
    // The one-time code and the instance go to the server; nothing else identifies the user.
    expect(client.sessionRequests).toEqual([{ code: "e2e-code-1", instanceId }]);
    expect((await client.host()).commands).toEqual(
      expect.arrayContaining(["AUTHORIZE", "AUTHENTICATE", "GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS", "SUBSCRIBE"])
    );
  });

  test("a failed Activity sign-in shows the link-interrupted gate", async ({ page }) => {
    const client = await openActivity(page, {
      instanceId: uniqueInstanceId("signin-fail"),
      user: PILOT,
      sessionError: "Discord Activity authentication is not configured."
    });

    await expect(client.app.getByRole("heading", { name: "Link interrupted" })).toBeVisible();
    await expect(client.app.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Discord Activity authentication is not configured.");
    await expect(client.app.getByRole("button", { name: "Retry connection" })).toBeVisible();
  });

  test("the party roster shows safe profile cards and no Discord or player IDs", async ({ page }) => {
    const client = await openActivity(page, {
      instanceId: uniqueInstanceId("roster"),
      user: PILOT,
      participants: [PILOT, FRIEND, LATECOMER],
      roster: {
        connectedCount: 3,
        members: [
          partyMember(PILOT, { isCurrentPlayer: true, title: "Arena Breaker", level: 7, duel: { played: 5, wins: 3, losses: 1, draws: 1 } }),
          partyMember(FRIEND, { level: 4, duel: { played: 2, wins: 0, losses: 2, draws: 0 } }),
          partyMember(LATECOMER, { profileReady: false })
        ]
      }
    });
    await expectShell(client);

    const party = await openParty(client.app);
    await expect(party).toBeVisible();
    await expect(connectedCount(party)).toHaveText("3 connected");
    const cards = party.locator(".party-member");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText("You");
    await expect(cards.nth(0)).toContainText(PILOT.displayName);
    await expect(cards.nth(0)).toContainText("Arena Breaker · Level 7");
    await expect(cards.nth(0)).toContainText("3-1-1");
    await expect(cards.nth(0)).toContainText("5 played");
    await expect(cards.nth(1)).toContainText("Connected");
    await expect(cards.nth(1)).toContainText("0-2-0");
    await expect(cards.nth(2)).toContainText("Syncing");
    await expect(cards.nth(2)).toContainText(LATECOMER.displayName);

    // The roster call carries the Activity bearer session, not a cookie.
    expect(client.partyRequests).toContain(`Bearer ${client.sessionTokens[0]}`);
    // The SDK handed the client real Discord IDs and the session token; none reach the DOM.
    const html = await client.app.locator("body").innerHTML();
    for (const secret of [PILOT, FRIEND, LATECOMER].flatMap((user) => [user.discordUserId, user.playerId]).concat(client.sessionTokens)) {
      expect(html).not.toContain(secret);
    }
  });

  test("Invite Friends opens Discord's invite dialog and reports when it cannot", async ({ page }) => {
    const client = await openActivity(page, { instanceId: uniqueInstanceId("invite"), user: PILOT });
    await expectShell(client);

    const party = await openParty(client.app);
    await party.getByRole("button", { name: "Invite Friends" }).click();
    await expect(party.getByRole("status")).toHaveText("Discord invite opened.");
    expect((await client.host()).inviteCalls).toBe(1);
  });

  test("Invite Friends explains when this Discord context cannot invite", async ({ page }) => {
    const client = await openActivity(page, { instanceId: uniqueInstanceId("invite-fail"), user: PILOT, inviteFails: true });
    await expectShell(client);

    const party = await openParty(client.app);
    await party.getByRole("button", { name: "Invite Friends" }).click();
    await expect(party.getByRole("status")).toHaveText("Invites are unavailable in this Discord context.");
    await expect(party.getByRole("button", { name: "Invite Friends" })).toBeEnabled();
  });

  test("the duel lobby opens once a second fighter joins the instance", async ({ page }) => {
    const client = await openActivity(page, { instanceId: uniqueInstanceId("launch"), user: PILOT });
    await expectShell(client);

    const party = await openParty(client.app);
    await expect(party.locator(".party-member")).toHaveCount(1);
    await expect(party.getByRole("button", { name: "Open Duel Lobby" })).toBeDisabled();

    // Discord reports a new participant; the HUD count and the roster both refresh.
    client.setRoster({
      connectedCount: 2,
      members: [partyMember(PILOT, { isCurrentPlayer: true }), partyMember(FRIEND)]
    });
    await client.setParticipants([PILOT, FRIEND]);
    await expect(connectedCount(party)).toHaveText("2 connected");
    await expect(party.locator(".party-member")).toHaveCount(2);
    await expect(partyLink(client.app)).toHaveText("Discord Party 2");

    await party.getByRole("button", { name: "Open Duel Lobby" }).click();
    await expect(party).toBeHidden();
    await expect(client.app.getByRole("heading", { name: "Play with a friend" })).toBeVisible();
  });

  test("an unavailable roster can be retried", async ({ page }) => {
    const client = await openActivity(page, { instanceId: uniqueInstanceId("retry"), user: PILOT, roster: null });
    await expectShell(client);

    const party = await openParty(client.app);
    await expect(party.getByRole("status")).toHaveText("Discord party is temporarily unavailable");
    await expect(party.getByText("No connected fighters found.")).toBeVisible();

    client.setRoster({ connectedCount: 1, members: [partyMember(PILOT, { isCurrentPlayer: true })] });
    await party.getByRole("button", { name: "Retry roster" }).click();
    await expect(party.locator(".party-member")).toHaveCount(1);
    await expect(party.getByRole("button", { name: "Retry roster" })).toBeHidden();
  });

  test("Profile syncs over the Activity session and refreshes progression from verified history", async ({ page }) => {
    const joined = "2026-02-01T12:00:00.000Z";
    const synced: PlayerProgression = { xp: 300, level: 3, badges: [], unlockedTitles: ["fuse-initiate"], equippedTitle: "fuse-initiate" };
    const afterDuels: PlayerProgression = { xp: 520, level: 4, badges: [], unlockedTitles: ["fuse-initiate", "arena-breaker"], equippedTitle: "arena-breaker" };
    const profile: PlayerProfile = {
      playerId: PILOT.playerId,
      identity: { displayName: PILOT.displayName, avatarUrl: null, source: "discord-activity", refreshedAt: joined },
      preferences: DEFAULT_PROFILE_PREFERENCES,
      progression: synced,
      stats: {
        local: EMPTY_PROFILE_MATCH_STATS,
        duel: { played: 1, wins: 1, losses: 0, draws: 0 },
        party: EMPTY_PROFILE_MATCH_STATS,
        partySeriesWins: 0,
        bestScore: 0,
        bestWinStreak: 1
      },
      createdAt: joined,
      updatedAt: joined,
      lastSeenAt: joined
    };
    const profileAuth: string[] = [];
    await page.route("**/api/profile", async (route) => {
      profileAuth.push(route.request().headers().authorization ?? "");
      await route.fulfill({ json: { ok: true, created: false, profile } });
    });
    await page.route("**/api/profile/history?*", async (route) => {
      profileAuth.push(route.request().headers().authorization ?? "");
      await route.fulfill({
        json: {
          ok: true,
          stats: { ...profile.stats, duel: { played: 2, wins: 2, losses: 0, draws: 0 }, bestWinStreak: 2 },
          progression: afterDuels,
          matches: [
            { id: "e2e-duel-2", kind: "duel", result: "win", opponentName: FRIEND.displayName, durationMs: 64_000, score: null, reason: "blast", playedAt: joined }
          ],
          nextCursor: null
        }
      });
    });
    const client = await openActivity(page, { instanceId: uniqueInstanceId("profile"), user: PILOT });
    await expectShell(client);

    await client.app.getByRole("button", { name: "Menu" }).click();
    await client.app.locator(".shell-menu-item", { hasText: "Profile" }).click();
    const dialog = client.app.getByRole("dialog", { name: "Fighter Profile" });
    await expect(dialog.locator(".profile-sync-status")).toHaveText("Synced");
    const identity = dialog.getByLabel("Discord identity");
    await expect(identity.getByRole("heading", { name: PILOT.displayName })).toBeVisible();
    await expect(identity).toContainText("Discord Activity");
    // The server's history view supersedes the profile snapshot it loaded first.
    await expect(identity).toContainText("Arena Breaker");
    await expect(identity).toContainText("Level 4");
    await expect(dialog.locator('.profile-record[data-kind="duel"]')).toContainText("2-0-0");
    await expect(dialog.getByText(`vs ${FRIEND.displayName}`)).toBeVisible();

    expect(profileAuth.length).toBeGreaterThanOrEqual(2);
    expect(new Set(profileAuth)).toEqual(new Set([`Bearer ${client.sessionTokens[0]}`]));
    expect(await client.app.locator("body").innerHTML()).not.toContain(PILOT.playerId);
  });
});
