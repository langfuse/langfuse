import { test, expect } from "@playwright/test";

test("Sign in, create an organization, create a project", async ({ page }) => {
  test.setTimeout(60000);

  // Sign in
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL("/");

  // Start create org flow
  await page.isVisible('[data-testid="create-organization-btn"]');
  await page.click('[data-testid="create-organization-btn"]');
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL("/setup");

  // Create an organization
  await expect(page.locator("data-testid=new-org-form")).toBeVisible();
  await page.fill('[data-testid="new-org-name-input"]', "e2e test org");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  expect(page.url()).toContain("/organization/");
  expect(page.url()).toContain("/setup?orgstep=invite-members");

  // Parse the organization ID from the URL using a simpler method
  const url = new URL(page.url());
  const organizationId = url.pathname.split("/")[2];
  console.log("organization", organizationId);

  // Skip add new members step
  await page.isVisible('[data-testid="btn-skip-add-members"]');
  await page.click('[data-testid="btn-skip-add-members"]');
  expect(page.url()).toContain(
    "/organization/" + organizationId + "/setup?orgstep=create-project",
  );

  // Create project
  await expect(page.locator("data-testid=new-project-form")).toBeVisible();
  await page.fill('[data-testid="new-project-name-input"]', "e2e test project");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  expect(page.url()).toContain("/project/");
  expect(page.url()).toContain("/setup");

  const projectUrl = new URL(page.url());
  const projectId = projectUrl.pathname.split("/")[2];

  // check that the project exists by navigating to its dashboard
  await page.goto("/project/" + projectId);
  await page.waitForTimeout(2000);
  expect(page.url()).toContain("/project/" + projectId);
  expect(page.url()).not.toContain("/setup");

  const headings = await page.locator("h2").allTextContents();
  expect(headings).toContain("Dashboard");
});
