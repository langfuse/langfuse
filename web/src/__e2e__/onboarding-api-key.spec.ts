import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@langfuse/shared/src/db";
import { signIn } from "./utils/auth";

/**
 * Creating the first API key from the onboarding card is the first thing a new
 * project does. The card and `/traces/setup` pick their create input from the
 * session: the Developer role where key roles are on, no role otherwise. If that input
 * carries a role the active `API_AUTH_MIGRATION` mode refuses, or leaves a
 * default role it refuses, onboarding breaks while the settings dialog and
 * every server test that passes its own role keep passing. That is how
 * #18419's regression reached main.
 *
 * This spec therefore drives the real flow — new organization, new project,
 * click the button, read the keys off the screen — rather than calling the
 * router, and it deliberately runs under the default env: no
 * `API_AUTH_MIGRATION`, no `API_KEY_*_ROLES_ENABLE`, so key roles are on.
 */

const UNIQUE = Date.now().toString(36);

// `pk-lf-`/`sk-lf-` plus a UUID, per `generateKeySet` in
// packages/shared/src/server/auth/apiKeys.ts. Anchored so these match the
// single `<code>` element holding the bare key and never the `.env` snippet
// that quotes both of them.
const PUBLIC_KEY_PATTERN = /^pk-lf-[0-9a-f-]{36}$/;
const SECRET_KEY_PATTERN = /^sk-lf-[0-9a-f-]{36}$/;

/**
 * Signs in and creates a brand new organization with one project, so its
 * traces page lands on the onboarding card instead of a populated table.
 */
async function createFirstProject(page: Page, label: string): Promise<string> {
  await page.goto("/auth/sign-in");
  await signIn(page);

  await page.goto("/setup");
  const orgForm = page.getByTestId("new-org-form");
  await expect(orgForm).toBeVisible();
  await page
    .getByTestId("new-org-name-input")
    .fill(`e2e onboarding api key org ${UNIQUE} ${label}`);
  await orgForm.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(
    /\/organization\/.*\/setup\?orgstep=create-project/,
    { timeout: 15000 },
  );

  const projectForm = page.getByTestId("new-project-form");
  await expect(projectForm).toBeVisible();
  await page
    .getByTestId("new-project-name-input")
    .fill(`e2e onboarding api key project ${UNIQUE} ${label}`);
  await projectForm.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/project\/.*\/traces/, { timeout: 15000 });

  const projectId = new URL(page.url()).pathname.split("/")[2];
  expect(projectId).toBeTruthy();
  return projectId;
}

/**
 * Asserts the displayed key is a real, usable one — a project-scoped row on
 * the project, not a value the client made up — and a named Developer key that
 * never expires.
 */
async function expectOnboardingKey(publicKeyValue: string, projectId: string) {
  const persistedKey = await prisma.apiKey.findUniqueOrThrow({
    where: { publicKey: publicKeyValue },
  });
  expect(persistedKey.projectId).toBe(projectId);
  expect(persistedKey.scope).toBe("PROJECT");
  expect(persistedKey.note).toBe("onboarding-setup-key");
  expect(persistedKey.expiresAt).toBeNull();
  const roleAssignment = await prisma.roleAssignment.findFirstOrThrow({
    where: { apiKeyId: persistedKey.id },
  });
  expect(roleAssignment.systemRole).toBe("MEMBER");
}

test("Create the first project, then create its API key from the onboarding card", async ({
  page,
}) => {
  const projectId = await createFirstProject(page, "card");

  // Step 1 of the onboarding card: "Create API keys".
  const createApiKeyButton = page.getByRole("button", {
    name: "Create new API key",
  });
  await expect(createApiKeyButton).toBeEnabled();
  await createApiKeyButton.click();

  // The card swaps the button for the key detail panel. Failing here is the
  // regression: the mutation rejects, a "Failed to create API key" toast shows
  // instead, and the user leaves onboarding with no keys.
  const secretKey = page.getByText(SECRET_KEY_PATTERN);
  const publicKey = page.getByText(PUBLIC_KEY_PATTERN);
  await expect(publicKey).toBeVisible();

  await expect(secretKey).toHaveCount(0);
  const showKeyButtons = page.getByRole("button", { name: "Show key" });
  await expect(showKeyButtons).toHaveCount(2);
  await showKeyButtons.first().click();
  await expect(secretKey).toBeVisible();

  const secretKeyValue = (await secretKey.innerText()).trim();
  const publicKeyValue = (await publicKey.innerText()).trim();

  // The panel also offers the pair as a copyable `.env` block; it is what the
  // user actually pastes, so it has to carry the same two values.
  const envSnippet = page.locator("code", { hasText: "LANGFUSE_SECRET_KEY" });
  // The snippet's actions only show on hover.
  await envSnippet.hover();
  await showKeyButtons.first().click();
  await expect(envSnippet).toContainText(
    `LANGFUSE_SECRET_KEY="${secretKeyValue}"`,
  );
  await expect(envSnippet).toContainText(
    `LANGFUSE_PUBLIC_KEY="${publicKeyValue}"`,
  );

  await expectOnboardingKey(publicKeyValue, projectId);
});

test("Create the first API key from /traces/setup", async ({ page }) => {
  const projectId = await createFirstProject(page, "setup page");

  await page.goto(`/project/${projectId}/traces/setup`);
  await page.getByRole("button", { name: "Create new API key" }).click();

  const publicKey = page.getByText(PUBLIC_KEY_PATTERN);
  await expect(publicKey).toBeVisible();
  await expectOnboardingKey((await publicKey.innerText()).trim(), projectId);
});
