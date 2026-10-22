import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { signIn } from "./utils/auth";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const idPrefix = `row-navigation-${Date.now()}`;

test.beforeAll(() => {
  execFileSync(
    "pnpm",
    [
      "exec",
      "dotenv",
      "-e",
      ".env",
      "-o",
      "--",
      "pnpm",
      "run",
      "seed",
      "--",
      "long-session",
      "--traces",
      "1",
      "--v4",
      "--id-prefix",
      idPrefix,
    ],
    { cwd: path.resolve(process.cwd(), "..") },
  );
});

test("Users and Sessions rows open their detail pages", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await signIn(page);

  for (const { table, detailPath, cellIndex } of [
    { table: "users", detailPath: "users", cellIndex: 1 },
    { table: "sessions", detailPath: "sessions", cellIndex: 2 },
  ]) {
    await page.goto(`/project/${projectId}/${table}`);
    if (table === "users") {
      await page.getByRole("button", { name: /Past 1 day/ }).click();
      await page.getByText("Past 7 days", { exact: true }).click();
    }
    const row = page.locator(`tbody tr:has(a[href*="${idPrefix}"])`).first();
    const detailLink = row.locator(`a[href*="/${detailPath}/"]`).first();
    const href = await detailLink.getAttribute("href");
    expect(href).toBeTruthy();

    if (table === "sessions") {
      await row.locator('a[href*="/users/"]').first().click();
      await expect(page).toHaveURL(/\/users\//);

      await page.goto(`/project/${projectId}/sessions`);
      await row.getByRole("checkbox").click();
      await expect(row.getByRole("checkbox")).toBeChecked();
      await expect(page).toHaveURL(`/project/${projectId}/sessions`);
    }

    await row.locator("td").nth(cellIndex).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === new URL(href!, url).pathname,
    );
    await expect(page.getByTestId("page-header-title")).toContainText(
      decodeURIComponent(href!.split("/").pop()!),
    );
  }
});
