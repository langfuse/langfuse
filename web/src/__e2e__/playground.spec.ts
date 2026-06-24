import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@langfuse/shared/src/db";
import fs from "fs";
import path from "path";

const signin = async (page: Page) => {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL("/");
};

const getProjectUrlForEmail = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      organizationMemberships: {
        include: {
          organization: {
            include: {
              projects: true,
            },
          },
        },
      },
    },
  });

  return `/project/${user?.organizationMemberships[0].organization.projects[0].id}`;
};

test.describe("Playground Draft Import/Export", () => {
  test("Export draft and Import draft", async ({ page }) => {
    test.setTimeout(60000);
    await signin(page);

    const projectUrl = await getProjectUrlForEmail("demo@langfuse.com");
    await page.goto(projectUrl + "/playground", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(projectUrl + "/playground");

    // Check that Import and Export buttons are present
    const importBtn = page.locator('button[title="Import draft"]');
    const exportBtn = page.locator('button[title="Export draft"]');
    await expect(importBtn).toBeVisible();
    await expect(exportBtn).toBeVisible();

    // Verify Export download
    const downloadPromise = page.waitForEvent("download");
    await exportBtn.click();
    const download = await downloadPromise;
    const downloadPath = path.join(__dirname, "downloaded-draft.json");
    await download.saveAs(downloadPath);

    // Read exported JSON and check version
    const content = fs.readFileSync(downloadPath, "utf-8");
    const json = JSON.parse(content);
    expect(json.schemaVersion).toBe("langfuse-playground-draft/v1");

    // Create a modified draft and test Import
    const draftPayload = {
      schemaVersion: "langfuse-playground-draft/v1",
      messages: [
        { role: "system", content: "You are a test import bot." },
        { role: "user", content: "Hello from imported test." },
      ],
      variables: {
        imported_key: "imported_value",
      },
    };
    const uploadPath = path.join(__dirname, "test-import-draft.json");
    fs.writeFileSync(uploadPath, JSON.stringify(draftPayload, null, 2));

    // Upload draft via the Import button
    const fileChooserPromise = page.waitForEvent("filechooser");
    await importBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(uploadPath);

    // Verify state was restored
    await page.waitForTimeout(1000);

    // Check if the page contains text from imported messages
    await expect(page.locator("body")).toContainText("You are a test import bot.");
    await expect(page.locator("body")).toContainText("Hello from imported test.");

    // Clean up temporary files
    try {
      fs.unlinkSync(downloadPath);
      fs.unlinkSync(uploadPath);
    } catch (e) {
      console.warn("Could not delete temp files:", e);
    }
  });
});
