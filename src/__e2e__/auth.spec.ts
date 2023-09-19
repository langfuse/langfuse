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

  // console log the page content
  console.log(page.url());
});
