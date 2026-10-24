// Docs: /docs/metrics/features/custom-dashboards ("Build your dashboard").
// New dashboard "Observation Performance": picks the past 7 days and adds the
// saved "Observation Latencies" widget. The take ends on the
// new dashboard, so its loop seam cuts back to the dashboards list.
import { openScene, seed } from "./lib.mjs";

// Start every take with the widget saved and no "Observation Performance"
// dashboard.
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
  "--dashboards",
  "widget",
]);
const scene = await openScene("create-dashboard");
const { page, glideTo, glideClick, wide } = scene;

await page.goto("http://localhost:3000/project/docs-demo/dashboards");
await page.getByText("Langfuse Usage Management").waitFor();
await page.waitForTimeout(1200);
const rest = { x: 980, y: 600 };
await scene.placeCursor(rest.x, rest.y);
const onLabel = { x: 0.15, y: 0.5 };

await scene.record();
await page.waitForTimeout(1000);
await glideClick(
  page.getByText("New dashboard", { exact: true }),
  1000,
  onLabel,
);
const name = page.locator("#dashboard-name");
await scene.cut(async () => {
  await name.waitFor();
  await page.waitForTimeout(300);
});
const form = { x: 448, y: 40, width: 640, height: 360 };
wide();
await glideClick(name, 700, { x: 0.85, y: 0.5 });
await page.keyboard.press("ControlOrMeta+A");
await page.keyboard.type("Observation Performance", { delay: 32 });
await page.waitForTimeout(200);
await glideClick(page.locator("#dashboard-description"), 500, {
  x: 0.85,
  y: 0.3,
});
await page.keyboard.type("Latency by level", { delay: 32 });
await page.waitForTimeout(400);
await glideClick(page.getByRole("button", { name: "Create" }), 900);
wide();
const addWidget = page.getByRole("button", { name: "Add Widget" });
const created = page.getByText("Dashboard created");
await scene.cut(async () => {
  await addWidget.waitFor();
  await page.getByText("Observation Performance", { exact: true }).waitFor();
  await page.waitForTimeout(300);
});
await page.waitForTimeout(500);
// The confirmation toast sits over "Add Widget" and can vanish under the
// cursor; step off it (hovering pauses its timer) and cut to after it has
// timed out instead of dismissing it.
await glideTo(1180, 300, 600);
if (await created.isVisible()) {
  await scene.cut(() => created.waitFor({ state: "hidden", timeout: 20_000 }));
}
// Pick the past week first: a widget re-rendered for a new range in place
// can leave its legend over the date axis.
const rangeArea = { x: 900, y: 0, width: 636, height: 358 };
await glideClick(page.getByText("Past 1 day"), 800, onLabel);
const week = page.getByText("Past 7 days", { exact: true });
await week.waitFor();
await page.waitForTimeout(300);
await glideClick(week, 450, { x: 0.2, y: 0.5 });
await page.waitForURL(/dateRange=7d/);
await page.waitForTimeout(400);
await page.evaluate(() => document.activeElement?.blur());
await glideClick(addWidget, 600, onLabel);
wide();
const dialog = page.getByRole("dialog");
const card = dialog.getByText("Observation Latencies");
await scene.cut(() => card.waitFor());
await page.waitForTimeout(500);
await glideClick(card, 700, { x: 0.3, y: 0.5 });
// Leave the chart area so it shows no hover tooltip once it renders.
await glideTo(rest.x, rest.y, 800);
// Resume once the chart has settled: its legend (with WARNING) is laid out
// and no loader has shown for a second.
const settled = () =>
  page.evaluate(() => {
    if (document.querySelector(".animate-spin")) return false;
    const legend = [...document.querySelectorAll("span, p, div")].find(
      (el) => el.textContent?.trim() === "WARNING",
    );
    return Boolean(legend && legend.getBoundingClientRect().height > 0);
  });
await scene.cut(async () => {
  await dialog.waitFor({ state: "hidden" });
  for (let calm = 0, i = 0; calm < 4 && i < 200; i++) {
    calm = (await settled()) ? calm + 1 : 0;
    await page.waitForTimeout(250);
  }
});
await page.waitForTimeout(2000);
await scene.finish();
