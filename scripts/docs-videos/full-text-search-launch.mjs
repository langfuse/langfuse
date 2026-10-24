// Docs: /docs/observability/features/full-text-search.
// Type a phrase into the tracing table's search bar, scope it to input and
// output content, and open the one support reply that mentions it.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// Re-seeding writes a second copy of each v4 event row until ClickHouse merges
// them; force the merge before filming.
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8124";
for (const table of ["events_full", "events_core"]) {
  await fetch(CLICKHOUSE_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa("clickhouse:clickhouse")}` },
    body: `OPTIMIZE TABLE ${table} FINAL`,
  });
}
const scene = await openScene("full-text-search-launch");
const { page, glideTo, glideClick, focus, wide } = scene;
const loaded = () =>
  page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, {
    timeout: 60_000,
  });
const tracesUrl = links.at(-1);
const bar = page.getByTestId("search-bar-input");

/**
 * The screencast can drop the last paint before the page goes idle; a
 * near-invisible ticking pixel keeps frames coming.
 */
const addTicker = () =>
  page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      "@keyframes demo-tick{from{opacity:0.01}to{opacity:0.02}}.demo-tick{position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;pointer-events:none;background:#000;animation:demo-tick .1s steps(2) infinite}";
    document.head.appendChild(style);
    const tick = document.createElement("div");
    tick.className = "demo-tick";
    document.body.appendChild(tick);
  });

/** Waits for the table to settle and clears any slow-query toast. */
async function settle() {
  await loaded();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
  const toasts = page.locator("[data-sonner-toast]");
  for (let i = 0; i < 5 && (await toasts.count()); i++) {
    await toasts
      .first()
      .getByRole("button")
      .first()
      .evaluate((button) => button.click())
      .catch(() => {});
    await page.waitForTimeout(400);
  }
}

// Warm the filtered query once so the take does not wait on it.
await page.goto(`${tracesUrl}?search=cracked+bumper&searchType=content`);
await page.getByText("support-reply", { exact: true }).first().waitFor();
await page.goto(tracesUrl);
await bar.waitFor();
await settle();
await addTicker();
await scene.placeCursor(1180, 640);
await page.waitForTimeout(400);

const searchArea = { x: 48, y: 60, width: 853, height: 480 };

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(bar, 1000, { x: 0.12, y: 0.5 });
focus(searchArea, 1.8);
await page.waitForTimeout(200);
await page.keyboard.type("cracked bumper", { delay: 30 });
const contentScope = page.getByRole("option", { name: /^content:/ });
await contentScope.waitFor();
await page.waitForTimeout(900);
// Scope the search to input and output content (click the option's icon).
await glideClick(contentScope, 600, { x: 0.04, y: 0.5 });
await scene.cut(async () => {
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForURL(/searchType=content/);
  await page
    .getByText("support-reply", { exact: true })
    .first()
    .waitFor({ timeout: 90_000 });
  await settle();
});
focus(searchArea, 1.8);
const answer = page.getByRole("row").filter({ hasText: "answer" }).first();
const answerBox = await answer.boundingBox();
await glideTo(answerBox.x + 300, answerBox.y + 60, 800);
wide();
await page.waitForTimeout(1200);
// Open the generation in the peek panel.
await glideClick(answer.getByText("answer", { exact: true }), 500, {
  x: 1.3,
  y: 0.5,
});
await scene.cut(async () => {
  // The table rows contain the message text too; the Formatted/Raw toggle
  // only renders in the peek panel.
  await page
    .getByText("Formatted", { exact: true })
    .first()
    .waitFor({ timeout: 90_000 });
  await page.waitForTimeout(300);
  await settle();
});
await glideTo(1180, 640, 800);
await page.waitForTimeout(2600);
// Back to the unfiltered table the take started on.
await scene.cut(async () => {
  await page.goto(tracesUrl);
  await bar.waitFor();
  await settle();
  await addTicker();
  await page.waitForTimeout(500);
});
await page.waitForTimeout(1200);
await scene.finish();
