import { test, expect } from "@playwright/test";

test("should redirect to sign-in if not signed in", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL("/auth/sign-in");
});

test("should redirect to home if signed in", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');

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
  await page.goto("auth/sign-up");
  await page.fill('input[name="name"]', "demo lang");
  await page.fill('input[name="email"]', randomEmailAddress());
  await page.fill('input[type="password"]', "password2");
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  // see get started page
  await expect(page).toHaveURL("/?getStarted=1");
});

test("Successfully sign up & able to go to homepage with uppercase email", async ({
  page,
}) => {
  await page.goto("auth/sign-up");
  await page.fill('input[name="name"]', "demo lang");
  await page.fill('input[name="email"]', "A" + randomEmailAddress());
  await page.fill('input[type="password"]', "password3");
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  // see get started page
  await expect(page).toHaveURL("/?getStarted=1");
});

test("Signup input validation", async ({ page }) => {
  await page.goto("auth/sign-up");
  await page.fill('input[name="email"]', "notanemail");
  await page.fill('input[type="password"]', "shortPw");
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  await expect(page.getByText("Invalid email")).toBeVisible();
  await expect(
    page.getByText("Password must be at least 8 characters long"),
  ).toBeVisible();
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  // don't see get started page
  await expect(page).not.toHaveURL("/?getStarted=1");
});

// random email address to be used in tests
const randomEmailAddress = () =>
  Math.random().toString(36).substring(2, 11) + "@example.com";

test("Unauthenticated user should be redirected to target URL after login", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');

  // wait 2 seconds
  await page.waitForTimeout(2000);

  // project id and prompt from seed.ts
  const promptUrl = "/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/prompts/summary-prompt";

  await page.getByRole("button", { name: /Demo User/ }).click();

  await page.getByRole("menuitem", { name: "Sign Out" }).click();

  await expect(page).toHaveURL("/auth/sign-in");

  await page.goto(promptUrl);

  await page.waitForTimeout(2000);

  await expect(page).toHaveURL(/targetPath/);

  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');

  await page.waitForTimeout(2000);

  await expect(page).toHaveURL(promptUrl);
});
