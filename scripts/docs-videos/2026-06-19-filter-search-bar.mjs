// Docs: /docs/observability/features/filter-search-bar.
// Builds filters in the observations search bar from suggestions (an observed
// level, a metadata value), then a scoped full-text search, and clears back to
// the unfiltered table.
import { openScene, seed } from "./lib.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const scene = await openScene("2026-06-19-filter-search-bar");
const { page, glideTo, glideClick, focus, wide } = scene;

const url = "http://localhost:3000/project/docs-demo/observations?dateRange=7d";
const search = page.getByTestId("search-bar-input");
/** Waits for the table and facets to settle after a filter change. */
async function settle() {
  // Refetches start a beat after the change; let them begin first.
  await page.waitForTimeout(600);
  for (let calm = 0, i = 0; calm < 4 && i < 200; i++) {
    const busy = await page.evaluate(() =>
      Boolean(document.querySelector(".animate-spin, .animate-pulse")),
    );
    calm = busy ? 0 : calm + 1;
    await page.waitForTimeout(250);
  }
  if (await page.getByText("Request Timed Out").isVisible()) {
    throw new Error("query timed out; re-run the take");
  }
}
const type = (text) => page.keyboard.type(text, { delay: 55 });
/** Picks a suggestion, clicked on its left edge so its text stays visible. */
async function pick(name) {
  const option = page.getByRole("option", { name }).first();
  await option.waitFor();
  await page.waitForTimeout(600);
  await glideClick(option, 500, { x: 0.04, y: 0.5 });
  await scene.cut(settle);
  await page.waitForTimeout(500);
}
async function clearAll() {
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(200);
}

await page.goto(url);
await search.waitFor();
await settle();
await page.waitForTimeout(800);
const rest = { x: 980, y: 560 };
await scene.placeCursor(rest.x, rest.y);
const barArea = { x: 40, y: 50, width: 1024, height: 576 };

await scene.record();
await page.waitForTimeout(1000);
// Hold the wide frame before the camera moves in.
wide();
await glideClick(search, 900, { x: 0.3, y: 0.5 });
focus(barArea, 1.3);
await type("level:");
await pick(/^WARNING/);
await type("metadata.scenario:refu");
await pick(/^refund-request/);
await page.waitForTimeout(700);

// Full-text search, scoped to the output payload.
await clearAll();
await scene.cut(settle);
await type("Happy to help");
await pick(/^output:"Happy to help"/);
// Close the suggestions to show the matching rows.
await page.keyboard.press("Escape");
await page.waitForTimeout(1500);

await clearAll();
await page.keyboard.press("Escape");
await scene.cut(settle);
await page.evaluate(() => document.activeElement?.blur());
focus(barArea, 1.3);
await glideTo(rest.x, rest.y, 900);
wide();
await page.waitForTimeout(1000);
if (!page.url().endsWith("dateRange=7d") && page.url().includes("filter=")) {
  throw new Error(`filters left behind: ${page.url()}`);
}
await scene.finish();
