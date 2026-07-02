import { test, expect, type Page } from "@playwright/test";

/**
 * Production-bundle smoke suite (LFE-10645).
 *
 * In CI this runs against a minified production build (`next build` +
 * `next start`), which is the ONLY place minifier-soundness bugs surface:
 * the build succeeds, `next dev` is unminified, and the crash happens at
 * runtime in the browser. LFE-10640 (`ReferenceError:
 * COLLAPSED_RAIL_BOUNDARY_PX is not defined`, prod-only, thrown on opening a
 * trace peek) shipped exactly through that gap.
 *
 * Every navigation here fails on any uncaught `pageerror` and on any
 * non-allowlisted `console.error`, across the key surfaces. Data comes from
 * the seeded demo project plus the deterministic seed-CLI scenarios the CI
 * job runs (`trace-tree`, `long-session` — see pipeline.yml).
 */

// Project id from packages/shared/scripts/seeder/seed-postgres.ts (same
// constant the other e2e specs use).
const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const PROJECT_PATH = `/project/${PROJECT_ID}`;

// Console errors that don't indicate a broken client bundle. Keep this list
// short and specific — every entry is a hole in the net.
const CONSOLE_ERROR_ALLOWLIST: RegExp[] = [
  // Resource-level 404s (e.g. favicon) are reported as console errors with
  // this fixed prefix; they are server/content issues, not client crashes.
  /Failed to load resource/,
];

interface ClientError {
  surface: string;
  kind: "pageerror" | "console.error";
  message: string;
}

/**
 * Collects uncaught page errors and console.error entries, attributed to the
 * surface being exercised at the time they fire.
 */
function trackClientErrors(page: Page) {
  const errors: ClientError[] = [];
  let surface = "(startup)";
  page.on("pageerror", (error) => {
    errors.push({ surface, kind: "pageerror", message: String(error) });
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (CONSOLE_ERROR_ALLOWLIST.some((pattern) => pattern.test(text))) return;
    errors.push({ surface, kind: "console.error", message: text });
  });
  return {
    errors,
    setSurface: (name: string) => {
      surface = name;
    },
    format: () =>
      errors.map((e) => `[${e.surface}] ${e.kind}: ${e.message}`).join("\n\n"),
  };
}

async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await expect(
    page.locator('button[data-testid="submit-email-password-sign-in-form"]'),
  ).toBeEnabled();
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');
  await expect(page).toHaveURL("/");
}

// The peek renders as a desktop side sheet (`[data-peek-content]`) only on
// desktop viewports; mobile falls back to a drawer.
test.use({ viewport: { width: 1440, height: 900 } });

test("trace peek opens without client-side errors (LFE-10640 regression)", async ({
  page,
}) => {
  const tracker = trackClientErrors(page);

  tracker.setSurface("sign-in");
  await signIn(page);

  // Traces list must show real rows (seeded via the trace-tree scenario).
  tracker.setSurface("traces list");
  await page.goto(`${PROJECT_PATH}/traces`);
  const rows = page.locator("tr[data-row-index]");
  await expect(rows.first()).toBeVisible();

  // Open the peek by clicking a non-interactive cell of the first row (the
  // row click handler ignores links/buttons). This is the exact interaction
  // that crashed in production for LFE-10640.
  tracker.setSurface("trace peek");
  await rows
    .first()
    .locator("td:not(:has(a, button, input, [role='button'], [role='link']))")
    .first()
    .click();
  await page.waitForURL(/[?&]peek=/);
  const peek = page.locator("[data-peek-content]");
  await expect(peek).toBeVisible();
  // The peek body swaps a skeleton for the trace tree once data loads; an
  // empty-but-open panel must not count as success.
  await expect(peek.getByText("Trace", { exact: true }).first()).toBeVisible();

  // Full-page trace view exercises the same layout module on its other path.
  tracker.setSurface("trace detail (full page)");
  const peekTraceId = new URL(page.url()).searchParams.get("peek");
  expect(peekTraceId).toBeTruthy();
  await page.goto(`${PROJECT_PATH}/traces/${peekTraceId}`);
  await expect(page.locator('[data-testid="page-header-title"]')).toBeVisible();

  // Give late async errors (effects, deferred queries) a moment to surface.
  await page.waitForTimeout(1000);

  expect(
    tracker.errors,
    `Client-side errors detected:\n${tracker.format()}`,
  ).toHaveLength(0);
});

test("key surfaces render without client-side errors", async ({ page }) => {
  const tracker = trackClientErrors(page);

  tracker.setSurface("sign-in");
  await signIn(page);

  const surfaces: { name: string; path: string }[] = [
    { name: "sessions", path: `${PROJECT_PATH}/sessions` },
    { name: "dashboards", path: `${PROJECT_PATH}/dashboards` },
    { name: "widgets", path: `${PROJECT_PATH}/widgets` },
    { name: "monitors", path: `${PROJECT_PATH}/monitors` },
    { name: "prompts", path: `${PROJECT_PATH}/prompts` },
    { name: "prompt detail", path: `${PROJECT_PATH}/prompts/summary-prompt` },
    { name: "settings", path: `${PROJECT_PATH}/settings` },
  ];

  for (const { name, path } of surfaces) {
    tracker.setSurface(name);
    await page.goto(path);
    await expect(
      page.locator('[data-testid="page-header-title"]'),
    ).toBeVisible();
    // Let client-side queries and effects run; crashes in lazily-rendered
    // content (charts, tables) surface shortly after the header does.
    await page.waitForTimeout(750);
  }

  // Sessions must show the seeded session (long-session scenario), so the
  // list path renders real rows, not just the empty state.
  tracker.setSurface("sessions rows");
  await page.goto(`${PROJECT_PATH}/sessions`);
  await expect(page.locator("tr[data-row-index]").first()).toBeVisible();
  await page.waitForTimeout(500);

  expect(
    tracker.errors,
    `Client-side errors detected:\n${tracker.format()}`,
  ).toHaveLength(0);
});
