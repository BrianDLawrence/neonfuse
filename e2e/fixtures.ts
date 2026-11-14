import type { Page } from "@playwright/test";
import type { HighScoreEntry } from "@/lib/leaderboard";

const now = new Date().toISOString();

export const TEST_PILOT = "Test Pilot";

export async function markHowToPlaySeen(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("neon-fuse:how-to-play-seen", "1");
    } catch {
      // A frame without storage already reads as a returning player.
    }
  });
}

/**
 * Stands in for a signed-in Discord web session. The browser tests run without
 * MongoDB or Discord credentials, so Better Auth's session lookup is answered here
 * and every other API keeps its real, unconfigured (offline) behaviour.
 */
export async function signIn(page: Page, { firstVisit = false }: { firstVisit?: boolean } = {}) {
  // How to play opens by itself on a device's first visit and covers the arena,
  // so tests start as a returning player unless they ask for the first visit.
  if (!firstVisit) {
    await markHowToPlaySeen(page);
  }

  await page.route("**/api/auth/get-session*", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "e2e-session",
          userId: "e2e-user",
          token: "e2e-token",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          createdAt: now,
          updatedAt: now
        },
        user: {
          id: "e2e-user",
          name: TEST_PILOT,
          email: "pilot@example.test",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now
        }
      }
    })
  );
}

declare global {
  interface Window {
    __roundStatuses?: string[];
    __bannerCaptions?: string[];
  }
}

/**
 * Records every round status the HUD shows, and every round-banner caption. The
 * countdown ticks and a fuse last about a second, so polling for them races the
 * arena clock on a loaded machine; the log keeps each transition in order.
 */
export async function recordRoundStatuses(page: Page) {
  await page.addInitScript(() => {
    const statuses: string[] = [];
    const captions: string[] = [];
    window.__roundStatuses = statuses;
    window.__bannerCaptions = captions;
    const observer = new MutationObserver(() => {
      const chip = Array.from(document.querySelectorAll(".hud-chip")).find(
        (element) => element.firstElementChild?.textContent === "Status"
      );
      const status = chip?.querySelector("strong")?.textContent;
      if (status && status !== statuses[statuses.length - 1]) statuses.push(status);
      const banner = document.querySelector(".round-banner");
      const caption = banner
        ? [".round-banner-title", ".round-banner-caption"]
            .map((selector) => banner.querySelector(selector)?.textContent)
            .filter(Boolean)
            .join(" ")
        : "";
      if (caption && caption !== captions[captions.length - 1]) captions.push(caption);
    });
    document.addEventListener("DOMContentLoaded", () =>
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    );
  });
}

export function roundStatuses(page: Page) {
  return page.evaluate(() => window.__roundStatuses ?? []);
}

export function bannerCaptions(page: Page) {
  return page.evaluate(() => window.__bannerCaptions ?? []);
}

export const HIGH_SCORES: HighScoreEntry[] = [
  {
    rank: 1,
    matchId: "e2e-match-1",
    visitorId: "e2e-visitor",
    playerName: "ACE",
    score: 4200,
    mode: "player-vs-bot",
    winner: "player",
    durationMs: 61_000,
    blocksCleared: 18,
    createdAt: now
  }
];

export async function stubHighScores(page: Page) {
  await page.route("**/api/high-scores?*", (route) =>
    route.fulfill({ json: { ok: true, stored: true, scores: HIGH_SCORES } })
  );
}
