import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@langfuse/shared/src/db";

// const checkConsoleErrors = async (page: Page) => {
//   const errors: string[] = [];
//   page.on("pageerror", (err) => {
//     errors.push(err.message);
//   });
//   page.on("console", (msg) => {
//     if (msg.type() === "error") {
//       errors.push(msg.text());
//     }
//   });
//
//   page.on("response", async (response) => {
//     if (response.status() === 500) {
//       console.error(
//         "Network request error: ",
//         response.url,
//         await response.text(),
//       );
//     }
//   });
//
//   return errors;
// };

const cleanUpConsoleEventListeners = (page: Page) => {
  page.removeAllListeners("pageerror");
  page.removeAllListeners("console");
};

test.describe("Create project", () => {
  test("Sign in, create an organization, create a project", async ({
    page,
  }) => {
    test.setTimeout(60000);
    // const errors = await checkConsoleErrors(page);

    // Sign in
    await page.goto("/auth/sign-in");
    await page.fill('input[name="email"]', "demo@langfuse.com");
    await page.fill('input[type="password"]', "password");
    await page.click(
      'button[data-testid="submit-email-password-sign-in-form"]',
    );
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
    await page.fill(
      '[data-testid="new-project-name-input"]',
      "e2e test project",
    );
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
    expect(page.url()).toContain("/project/");
    expect(page.url()).toContain("/setup");

    const projectUrl = new URL(page.url());
    const projectId = projectUrl.pathname.split("/")[2];

    // check that the project exists by navigating to its home screen
    await page.goto("/project/" + projectId);
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/project/" + projectId);
    expect(page.url()).not.toContain("/setup");

    const headings = await page.locator("h2").allTextContents();
    expect(headings).toContain("Home");

    // Check for console errors
    // expect(errors).toHaveLength(0);
  });

  test("Sign in", async ({ page }) => {
    // const errors = await checkConsoleErrors(page);
    await signin(page);
    // expect(errors).toHaveLength(0);
    cleanUpConsoleEventListeners(page);
  });

  [
    { title: "Tracing", url: "/traces", subTitle: "Traces" },
    { title: "Sessions", url: "/sessions" },
    { title: "Tracing", url: "/observations", subTitle: "Observations" },
    { title: "Scores", url: "/scores" },
  ].forEach(({ title, url, subTitle }) => {
    test(`Check ${title} ${subTitle ? `- ${subTitle}` : ""} page`, async ({
      page,
    }) => {
      // const errors = await checkConsoleErrors(page);
      await signin(page);

      await page.waitForTimeout(2000);

      const projectUrl = await getProjectUrlForEmail("demo@langfuse.com");
      await page.goto(projectUrl + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      await expect(page).toHaveURL(projectUrl + url);
      await checkPageHeaderTitle(page, title);

      // Check that each error contains the expected string

      // errors.forEach((error) => {
      //   expect(error).toContain(
      //     "Document policy violation: js-profiling is not allowed in this document.",
      //   );
      // });
      cleanUpConsoleEventListeners(page);
    });
  });
});

const signin = async (page: Page) => {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');
  await page.waitForTimeout(2000);
  await expect(page).toHaveURL("/");
};

const checkPageHeaderTitle = async (page: Page, title: string) => {
  const pageHeaderTitle = await page
    .locator('[data-testid="page-header-title"]')
    .textContent();
  expect(pageHeaderTitle).toContain(title);
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
