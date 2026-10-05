import { expect, type Page } from "@playwright/test";

/** The account created by `pnpm --filter=shared run db:seed`. */
const DEMO_USER = {
  email: "demo@langfuse.com",
  password: "password",
} as const;

/** Mirrors the `expect` timeout in playwright.config.ts. */
const SIGN_IN_TIMEOUT_MS = 60_000;

/**
 * Signs in through the credentials form and waits for the app to land on
 * `expectedUrl`.
 *
 * Navigation is the caller's job: specs reach this form from `/auth/sign-in`,
 * from a `?targetPath=` redirect, and from signing out mid-test.
 */
export async function signIn(
  page: Page,
  {
    email = DEMO_USER.email,
    password = DEMO_USER.password,
    expectedUrl = "/",
  }: { email?: string; password?: string; expectedUrl?: string } = {},
): Promise<void> {
  const submitButton = page.getByTestId("submit-email-password-sign-in-form");

  // "Sign in" stays disabled until react-hook-form has seen both fields, and
  // it only sees them once the page has hydrated: React keeps the text an
  // input already holds while hydrating but fires no change event for it, so
  // anything typed into the server-rendered form before that point lives in
  // the DOM and nowhere else. Retrying the fills until the button enables
  // turns the race into a wait instead of a form that can never be submitted.
  await expect(async () => {
    await page.fill('input[name="email"]', email);
    await page.fill('input[type="password"]', password);
    await expect(submitButton).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: SIGN_IN_TIMEOUT_MS });

  await submitButton.click();

  // A rejected sign-in parks the browser on exactly the URL a slow one does,
  // so waiting only for the navigation reports "still on /auth/sign-in"
  // either way — true in both cases and an explanation in neither. Race the
  // form's own error against the navigation and report whichever arrives.
  const formError = page.locator(".text-destructive").first();
  const rejection = await Promise.race([
    page
      .waitForURL(expectedUrl, { timeout: SIGN_IN_TIMEOUT_MS })
      .then(() => null),
    formError
      .waitFor({ state: "visible", timeout: SIGN_IN_TIMEOUT_MS })
      .then(async () => (await formError.textContent())?.trim() || "(no text)"),
  ]);

  if (rejection !== null) {
    throw new Error(`Sign-in was rejected by the form: ${rejection}`);
  }
}
