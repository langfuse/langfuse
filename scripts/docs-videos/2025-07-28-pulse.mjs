// Docs: /docs/observability/features/pulse.
// Pulse strip over 30 days of customer-support traffic: hover a count spike,
// switch to Cost, click the cost spike to narrow the table to that window,
// then return to the full 30 days and Count.
import { openScene, seed } from "./lib.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const scene = await openScene("2025-07-28-pulse");
const { page, glideTo, glideClick, focus, wide } = scene;

const url =
  "http://localhost:3000/project/docs-demo/observations?dateRange=30d";
const strip = page.locator('svg[aria-label$="per bucket"]');
/** Waits until the strip and the table have loaded for the current state. */
async function settle() {
  await strip.waitFor();
  for (let calm = 0, i = 0; calm < 4 && i < 200; i++) {
    const busy = await page.evaluate(
      () =>
        Boolean(document.querySelector(".animate-spin, .animate-pulse")) ||
        document.querySelectorAll('svg[aria-label$="per bucket"] rect').length <
          5,
    );
    calm = busy ? 0 : calm + 1;
    await page.waitForTimeout(250);
  }
  // A query timeout on the shared dev stack leaves an error toast in frame;
  // fail the take so it can be re-run.
  if (await page.getByText("Request Timed Out").isVisible()) {
    throw new Error("query timed out; re-run the take");
  }
}
/** The tallest bar's hover point (CSS px), plus its center for clicking. */
const tallestBar = () =>
  page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label$="per bucket"]');
    const rects = [...svg.querySelectorAll("rect")]
      .map((r) => r.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.width < 40 && b.height > 0);
    const top = rects.reduce((a, b) => (b.height > a.height ? b : a));
    return { x: top.x + top.width / 2, y: top.y + top.height * 0.35 };
  });

await page.goto(url);
await page.getByText("Count", { exact: true }).first().waitFor();
await settle();
await page.waitForTimeout(800);
/** The strip's metric dropdown (the toolbar has a "Cost" preset too). */
async function metricTrigger(name) {
  const matches = page.getByText(name, { exact: true });
  for (let i = 0; i < (await matches.count()); i++) {
    const box = await matches.nth(i).boundingBox();
    if (box && box.y > 190 && box.y < 225) return matches.nth(i);
  }
  throw new Error(`no ${name} metric trigger`);
}
const rest = { x: 980, y: 560 };
await scene.placeCursor(rest.x, rest.y);
const stripArea = { x: 316, y: 178, width: 1220, height: 686 };
const onLabel = { x: 0.3, y: 0.5 };

await scene.record();
await page.waitForTimeout(1000);
// Hold the wide frame before the camera moves in.
wide();
// Hover the tallest count bar: the tooltip reads its window and event count.
let bar = await tallestBar();
await glideTo(bar.x, bar.y, 1000);
focus(stripArea, 1.26);
await page.waitForTimeout(1200);

// Switch the strip to Cost.
await glideClick(await metricTrigger("Count"), 800, onLabel);
const costItem = page.getByRole("menuitem", { name: "Cost" });
await costItem.waitFor();
await page.waitForTimeout(400);
await glideClick(costItem, 450, { x: 0.15, y: 0.5 });
await scene.cut(settle);
bar = await tallestBar();
await glideTo(bar.x, bar.y, 900);
await page.waitForTimeout(1200);

// Click the cost spike: the table narrows to that window.
await glideClick(strip, 300, {
  x:
    (bar.x - (await strip.boundingBox()).x) / (await strip.boundingBox()).width,
  y: 0.7,
});
await scene.cut(async () => {
  await page.waitForURL((u) => !u.search.includes("dateRange=30d"));
  await settle();
});
// Show the narrowed table, out of the strip so no tooltip lingers.
focus(stripArea, 1.26);
await glideTo(980, 340, 700);
wide();
await page.waitForTimeout(1500);

// Back to the full 30 days and Count, so the loop starts over.
const rangeTrigger = page
  .locator("button")
  .filter({ hasText: /Oct \d+, \d+:\d+/ });
await glideClick(rangeTrigger.first(), 900, { x: 0.15, y: 0.5 });
const month = page.getByText("Past 30 days", { exact: true });
await month.waitFor();
await page.waitForTimeout(300);
await glideClick(month.first(), 500, { x: 0.15, y: 0.5 });
await scene.cut(async () => {
  await page.waitForURL(/dateRange=30d/);
  await settle();
});
await glideClick(await metricTrigger("Cost"), 900, onLabel);
const countItem = page.getByRole("menuitem", { name: "Count" });
await countItem.waitFor();
await page.waitForTimeout(300);
await glideClick(countItem, 450, { x: 0.15, y: 0.5 });
await scene.cut(settle);
await page.evaluate(() => document.activeElement?.blur());
await glideTo(rest.x, rest.y, 900);
await page.waitForTimeout(1000);
if (await page.getByText("Request Timed Out").isVisible()) {
  throw new Error("query timed out; re-run the take");
}
await scene.finish();
