import { test, expect } from "@playwright/test";
import { prisma } from "@langfuse/shared/src/db";
import { signIn } from "./utils/auth";

/**
 * Creating the first API key from the onboarding card is the first thing a new
 * project does, and it is the one call site that sends no role at all —
 * `projectApiKeys.create.mutateAsync({ projectId })`. So a create input whose
 * *default* role the active `API_AUTH_MIGRATION` mode refuses breaks onboarding
 * while every caller that passes a role explicitly, and every server test that
 * does the same, keeps passing. That is how #18419's regression reached main.
 *
 * This spec therefore drives the real flow — new organization, new project,
 * click the button, read the keys off the screen — rather than calling the
 * router, and it deliberately runs under the default env: no
 * `API_AUTH_MIGRATION`, no `API_KEY_*_ROLES_ENABLE`.
 */

const UNIQUE = Date.now().toString(36);
const ORG_NAME = `e2e onboarding api key org ${UNIQUE}`;
const PROJECT_NAME = `e2e onboarding api key project ${UNIQUE}`;

// `pk-lf-`/`sk-lf-` plus a UUID, per `generateKeySet` in
// packages/shared/src/server/auth/apiKeys.ts. Anchored so these match the
// single `<code>` element holding the bare key and never the `.env` snippet
// that quotes both of them.
const PUBLIC_KEY_PATTERN = /^pk-lf-[0-9a-f-]{36}$/;
const SECRET_KEY_PATTERN = /^sk-lf-[0-9a-f-]{36}$/;

test("Create the first project, then create its API key from the onboarding card", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await signIn(page);

  // A brand new organization, so the project below is its first one and the
  // traces page lands on the onboarding card instead of a populated table.
  await page.goto("/setup");
  const orgForm = page.getByTestId("new-org-form");
  await expect(orgForm).toBeVisible();
  await page.getByTestId("new-org-name-input").fill(ORG_NAME);
  await orgForm.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(
    /\/organization\/.*\/setup\?orgstep=create-project/,
    { timeout: 15000 },
  );

  const projectForm = page.getByTestId("new-project-form");
  await expect(projectForm).toBeVisible();
  await page.getByTestId("new-project-name-input").fill(PROJECT_NAME);
  await projectForm.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/project\/.*\/traces/, { timeout: 15000 });

  const projectId = new URL(page.url()).pathname.split("/")[2];
  expect(projectId).toBeTruthy();

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
  await expect(secretKey).toBeVisible();
  await expect(publicKey).toBeVisible();

  const secretKeyValue = (await secretKey.innerText()).trim();
  const publicKeyValue = (await publicKey.innerText()).trim();

  // The panel also offers the pair as a copyable `.env` block; it is what the
  // user actually pastes, so it has to carry the same two values.
  const envSnippet = page.locator("code", { hasText: "LANGFUSE_SECRET_KEY" });
  await expect(envSnippet).toContainText(
    `LANGFUSE_SECRET_KEY="${secretKeyValue}"`,
  );
  await expect(envSnippet).toContainText(
    `LANGFUSE_PUBLIC_KEY="${publicKeyValue}"`,
  );

  // ...and the displayed key is a real, usable one: a project-scoped row on
  // the project that was just created, not a value the client made up.
  const persistedKey = await prisma.apiKey.findUnique({
    where: { publicKey: publicKeyValue },
  });
  expect(persistedKey).not.toBeNull();
  expect(persistedKey?.projectId).toBe(projectId);
  expect(persistedKey?.scope).toBe("PROJECT");
});
