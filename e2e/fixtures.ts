import type { Page } from "@playwright/test";
import type { HighScoreEntry } from "@/lib/leaderboard";

const now = new Date().toISOString();

export const TEST_PILOT = "Test Pilot";

/**
 * Stands in for a signed-in Discord web session. The browser tests run without
 * MongoDB or Discord credentials, so Better Auth's session lookup is answered here
 * and every other API keeps its real, unconfigured (offline) behaviour.
 */
export async function signIn(page: Page) {
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
