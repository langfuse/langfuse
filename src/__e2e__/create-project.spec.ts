import { test, expect } from "@playwright/test";

test("should see new projects dialog open after clicking new project btn", async ({
  page,
}) => {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo2@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.waitForTimeout(2000);
  expect(await page.innerHTML("data-testid=create-new-project-title")).toBe(
    "Create new project",
  );
  await page.click('[data-testid="create-project-btn"]');
  await page.waitForTimeout(2000);
  await expect(page.locator("data-testid=new-project-form")).toBeVisible();
});

test("Create a project with provided name", async ({ page }) => {
  test.setTimeout(60000);

  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.isVisible('[data-testid="new-project-form"]');
  await page.click('[data-testid="create-project-btn"]');
  await page.waitForTimeout(2000);
  await expect(page.locator("data-testid=new-project-form")).toBeVisible();
  await page.fill(
    '[data-testid="new-project-name-input"]',
    "my e2e demo project",
  );
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  expect(page.url()).toContain("/project/");
  await page.waitForTimeout(2000);
  expect(await page.getByTestId("project-name").textContent()).toContain(
    "my e2e demo project",
  );
});
