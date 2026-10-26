import { test, expect, type Page, type Route } from "@playwright/test";
import superjson from "superjson";
import { type RouterOutputs } from "@/src/utils/api";
import { signIn } from "./utils/auth";

// The standard database seed gives the demo account access to this v4 project.
const PROJECT_PATH = "/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
type EvaluatorOption = RouterOutputs["evalsV2"]["options"][number];

function evaluator(id: string, name: string): EvaluatorOption {
  return {
    id,
    name,
    type: "LLM_AS_JUDGE",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    createdByUser: null,
    blockedAt: null,
    latestVersion: {
      id: `${id}-v1`,
      version: 1,
      prompt: null,
      variableMapping: null,
    },
  };
}

function gate() {
  return Promise.withResolvers<void>();
}

async function respond(route: Route, data: unknown) {
  await route.fulfill({
    json: { result: { data: superjson.serialize(data) } },
  });
}

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Go to..." }).click();
  await expect(page.locator("[cmdk-input]")).toBeVisible();
}

function options(page: Page) {
  return page.locator("[cmdk-item]:visible");
}

function evaluatorInput(route: Route): { search?: string; limit: number } {
  const input = new URL(route.request().url()).searchParams.get("input");
  if (!input) throw new Error("Evaluator options request has no input");
  return superjson.deserialize(JSON.parse(input));
}

async function evaluatorCatalog(
  page: Page,
  rows = [
    evaluator("correctness", "Correctness"),
    evaluator("safety", "Safety"),
  ],
  beforeResponse?: (search: string) => Promise<void>,
) {
  const searches: string[] = [];
  await page.route("**/api/trpc/evalsV2.options?*", async (route) => {
    const { search = "", limit } = evaluatorInput(route);
    searches.push(search);
    await beforeResponse?.(search);
    // Model the endpoint's case-insensitive name search and page cap, not UI filtering.
    const matches = rows
      .filter((row) => row.name.toLowerCase().includes(search.toLowerCase()))
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .slice(0, limit);
    await respond(route, matches);
  });
  return searches;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/auth/sign-in");
  await signIn(page);
  await page.goto(`${PROJECT_PATH}/evals`);
  await expect(page.getByRole("button", { name: "Go to..." })).toBeVisible();
});

test("publishes complete results and clears every action while a new search loads", async ({
  page,
}) => {
  const dashboards = gate();
  const prompts = gate();
  const safety = gate();
  const searches = await evaluatorCatalog(page, undefined, async (search) => {
    if (search === "safety") await safety.promise;
  });
  await page.route("**/api/trpc/dashboard.allDashboards?*", async (route) => {
    await dashboards.promise;
    await route.continue();
  });
  await page.route("**/api/trpc/prompts.allNames?*", async (route) => {
    await prompts.promise;
    await route.continue();
  });

  await openMenu(page);
  await expect(page.getByRole("status")).toHaveText(/Searching/);
  await expect(options(page)).toHaveCount(0);
  const dashboardsFinished = page.waitForResponse(
    "**/api/trpc/dashboard.allDashboards?*",
  );
  dashboards.resolve();
  await dashboardsFinished;
  await expect(options(page)).toHaveCount(0);
  prompts.resolve();
  await expect(options(page).first()).toBeVisible();

  const input = page.locator("[cmdk-input]");
  await input.fill("Safety");
  await expect(options(page)).toHaveCount(0);
  await input.press("Enter");
  await expect(page).toHaveURL(`${PROJECT_PATH}/evals`);
  await expect.poll(() => searches).toContain("safety");
  await expect(options(page)).toHaveCount(0);
  safety.resolve();
  await expect(
    page.getByRole("option", { name: "Safety", exact: true }),
  ).toBeVisible();
});

test("reopening resets the search and hides cached rows until refresh finishes", async ({
  page,
}) => {
  const refreshedDashboards = gate();
  const searches = await evaluatorCatalog(page);
  let dashboardRequests = 0;
  await page.route("**/api/trpc/dashboard.allDashboards?*", async (route) => {
    dashboardRequests += 1;
    if (dashboardRequests > 1) await refreshedDashboards.promise;
    await route.continue();
  });
  await openMenu(page);
  await expect(options(page).first()).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 100);
  await page.locator("[cmdk-input]").fill("cancelled-search");
  await page.keyboard.press("Escape");
  await expect(page.locator("[cmdk-input]")).toHaveCount(0);
  await page.clock.resume();

  await openMenu(page);
  await expect(page.locator("[cmdk-input]")).toHaveValue("");
  await expect(options(page)).toHaveCount(0);
  await expect.poll(() => dashboardRequests).toBe(2);
  refreshedDashboards.resolve();
  await expect(options(page).first()).toBeVisible();

  const requestsBeforeFocus = [...searches];
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(250);
  expect(searches).toEqual(requestsBeforeFocus);
  expect(dashboardRequests).toBe(2);
});

test("an older response cannot move the current result or change its click target", async ({
  page,
}) => {
  const oldResponse = gate();
  const searches = await evaluatorCatalog(
    page,
    [
      evaluator("correctness", "Correctness"),
      evaluator("toxicity", "Toxicity eval v2"),
    ],
    async (search) => {
      if (search === "correctness") await oldResponse.promise;
    },
  );
  await openMenu(page);
  await expect(options(page).first()).toBeVisible();
  const input = page.locator("[cmdk-input]");
  await input.fill("Correctness");
  await expect.poll(() => searches).toContain("correctness");
  await input.fill("eval Toxicity eval v2");
  await expect(options(page)).toHaveCount(0);
  const target = page.getByRole("option", {
    name: "Toxicity eval v2",
    exact: true,
  });
  await expect(target).toBeVisible();
  const original = await target.elementHandle();
  const oldRequestFinished = page.waitForEvent("requestfinished", (request) => {
    const input = new URL(request.url()).searchParams.get("input");
    return (
      request.url().includes("evalsV2.options") &&
      Boolean(input?.includes("correctness"))
    );
  });
  oldResponse.resolve();
  await oldRequestFinished;
  await expect(target).toBeVisible();
  expect(
    await target.evaluate((element, saved) => element === saved, original),
  ).toBe(true);
  await expect(
    page.getByRole("option", { name: "Correctness", exact: true }),
  ).toHaveCount(0);
  await target.click();
  await expect(page.locator("[cmdk-input]")).toHaveCount(0);
  await expect(page).toHaveURL(`${PROJECT_PATH}/evals/toxicity`);
});

test("short evaluator name fragments search beyond the first hundred rows", async ({
  page,
}) => {
  const catalog = Array.from({ length: 100 }, (_, index) =>
    evaluator(`quality-${index}`, `Quality check ${index}`),
  ).concat(evaluator("validity", "Validity"));
  const searches = await evaluatorCatalog(page, catalog);
  await openMenu(page);
  await expect(options(page).first()).toBeVisible();
  await page.locator("[cmdk-input]").fill("val");
  await expect(
    page.getByRole("option", { name: "Validity", exact: true }),
  ).toBeVisible();
  expect(searches).toContain("val");
});

test("a failed result source releases navigation without automatic retry backoff", async ({
  page,
}) => {
  await evaluatorCatalog(page);
  let requests = 0;
  await page.route("**/api/trpc/dashboard.allDashboards?*", async (route) => {
    requests += 1;
    await route.abort("failed");
  });
  await openMenu(page);
  await expect(options(page).first()).toBeVisible();
  expect(requests).toBe(1);
});
