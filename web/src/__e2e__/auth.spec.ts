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

  await expect(page).toHaveURL("/");
});

test("Successfully sign up & able to go to homepage", async ({ page }) => {
  await page.goto("auth/sign-up");
  await page.fill('input[name="name"]', "demo lang");
  await page.fill('input[name="email"]', randomEmailAddress());
  await page.fill('input[type="password"]', "Password2#!");
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  // see get started page
  await expect(page).toHaveURL("/");
});

test("Successfully sign up & able to go to homepage with uppercase email", async ({
  page,
}) => {
  await page.goto("auth/sign-up");
  await page.fill('input[name="name"]', "demo lang");
  await page.fill('input[name="email"]', "A" + randomEmailAddress());
  await page.fill('input[type="password"]', "Password3#!");
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  // see get started page
  await expect(page).toHaveURL("/");
});

test("Signup input validation", async ({ page }) => {
  await page.goto("auth/sign-up");
  await page.fill('input[name="email"]', "notanemail");
  await page.fill('input[type="password"]', "shortPw");
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  await expect(page.getByText("Invalid email")).toBeVisible();
  await expect(
    page.getByText("Password must be at least 8 characters long."),
  ).toBeVisible();
  await page.click('button[data-testid="submit-email-password-sign-up-form"]');
  await page.waitForTimeout(2000);
  // don't see get started page
  await expect(page).not.toHaveURL("/");
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
  const promptUrl =
    "/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/prompts/summary-prompt";

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

test("Unauthenticated user should not be redirected to non-relative URLs after login", async ({
  page,
}) => {
  const nonRelativeUrl = "https://example.com";
  await page.goto(
    `/auth/sign-in?targetPath=${encodeURIComponent(nonRelativeUrl)}`,
  );

  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');

  // Wait for navigation
  await page.waitForTimeout(2000);

  // Expect to be redirected to the home page, not the non-relative URL
  await expect(page).toHaveURL("/");

  // Verify we're logged in
  await expect(page.getByRole("button", { name: /Demo User/ })).toBeVisible();
});

test("Unauthenticated user should be redirected to relative URL after login", async ({
  page,
}) => {
  const relativeUrl = "/setup";
  await page.goto(
    `/auth/sign-in?targetPath=${encodeURIComponent(relativeUrl)}`,
  );

  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');

  // Wait for navigation
  await page.waitForTimeout(2000);

  // Expect to be redirected to the relative URL
  await expect(page).toHaveURL(relativeUrl);
});
