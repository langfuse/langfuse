import { test, expect } from "@playwright/test";

test("should redirect to sign-in if not signed in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/auth/sign-in");
});

test("should redirect to home if signed in", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');

  // wait 2 seconds
  await page.waitForTimeout(2000);

  if (process.env.CI)
    await expect(page).toHaveURL(
      // project id from seed.ts
      "/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    );
  else
    console.log(
      "Test skipped as redirect depends on db state, URL after signing in:",
      page.url(),
    );
});
