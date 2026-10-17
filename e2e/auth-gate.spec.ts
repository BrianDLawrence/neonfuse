import { expect, test } from "@playwright/test";

test("signed-out players land on the Discord sign-in gate", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Enter the arena" })).toBeVisible();
  const signIn = page.getByRole("button", { name: "Continue with Discord" });
  await expect(signIn).toBeVisible();
  await expect(signIn).toBeFocused();
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
});
