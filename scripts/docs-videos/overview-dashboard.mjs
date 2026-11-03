// Docs: /docs landing page, Observability > Dashboard tab.
// The project's home dashboard: traces, costs and scores, widened to the
// past 7 days, then scrolled through usage and latency charts.
import { openScene, seed } from "./lib.mjs";
import { smoothScroll, skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const homeUrl = "http://localhost:3000/project/docs-demo";

const scene = await openScene("overview-dashboard");
const { page, glideTo, glideClick, wide } = scene;

const rangeButton = page.getByRole("button", {
  name: /Past 1 day|Past 7 days/,
});
const homeLoaded = async () => {
  await page.getByText("Total traces tracked").waitFor({ timeout: 60_000 });
  await page.getByText("Model Usage").waitFor();
  await skeletonsGone(page, 60_000);
  await page.waitForTimeout(600);
};

await page.goto(homeUrl);
await homeLoaded();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1000);
wide();
// Hover the busiest trace name in the Traces chart.
const bar = page.getByText("support-chat", { exact: true }).first();
await glideTo(
  ...(await bar
    .boundingBox()
    .then((b) => [b.x + b.width / 2, b.y + b.height / 2])),
  900,
);
await page.waitForTimeout(1200);

// Past 7 days.
await glideClick(rangeButton.first(), 900, { x: 0.6, y: 0.5 });
const sevenDays = page.getByText("Past 7 days", { exact: true }).last();
await sevenDays.waitFor();
await page.waitForTimeout(500);
await glideClick(sevenDays, 600, { x: 0.3, y: 0.5 });
await scene.cut(homeLoaded);
await page.waitForTimeout(1400);

// Down through usage and latency charts, and back up.
await glideTo(1000, 560, 700);
await smoothScroll(page, 620, { x: 1000, y: 560 }, 1800);
await smoothScroll(page, 620, { x: 1000, y: 560 }, 1800);
await smoothScroll(page, -1240, { x: 1000, y: 560 }, 1100);

// Back to the past day for a seamless loop.
await glideTo(1000, 640, 700);
await scene.cut(async () => {
  await page.goto(homeUrl);
  await homeLoaded();
});
await page.waitForTimeout(900);
await scene.finish();
