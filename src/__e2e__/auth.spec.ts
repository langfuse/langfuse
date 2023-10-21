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

test("Successfully sign up & able to go to homepage", async ({ page }) => {
  const randEmailAddr = `demo2${Math.floor(Math.random() * 10)}${Math.floor(
    Math.random() * 10,
  )}${Math.floor(Math.random() * 10)}${Math.floor(
    Math.random() * 10,
  )}@langfuse.com`;
  page.goto("auth/sign-up");
  await page.fill('input[name="name"]', "demo lang");
  await page.fill('input[name="email"]', randEmailAddr);
  await page.fill('input[type="password"]', "password2");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  // see projects page
  await expect(page).toHaveURL("/?getStarted=1");
});

test("Signup validation", async ({ page }) => {
  const randEmailAddr = `demo2${Math.floor(Math.random() * 10)}${Math.floor(
    Math.random() * 10,
  )}${Math.floor(Math.random() * 10)}${Math.floor(
    Math.random() * 10,
  )}langfuse.com`;
  page.goto("auth/sign-up");
  await page.fill('input[name="email"]', randEmailAddr);
  await page.fill('input[type="password"]', "pass3");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await expect(page.getByText("Invalid email")).toBeVisible();
  await expect(
    page.getByText("Password must be at least 8 characters long"),
  ).toBeVisible();
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  // don't see projects page
  await expect(page).not.toHaveURL("/?getStarted=1");
});
