// Docs: /docs/metrics/features/custom-dashboards ("Create a widget").
// Widgets tab -> New widget: p95 observation latency broken down by level,
// named "Observation Latencies", saved as a line chart. The take ends on the
// list with the new widget, so its loop seam cuts back to the empty list.
import { openScene, seed } from "./lib.mjs";

// Start every take with no "Observation Latencies" widget in the project.
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
  "--dashboards",
  "clean",
]);
const scene = await openScene("create-widget");
const { page, glideTo, glideClick, wide } = scene;

await page.goto("http://localhost:3000/project/docs-demo/widgets");
await page.getByText("No results").waitFor();
await page.waitForTimeout(1200);
const rest = { x: 900, y: 520 };
await scene.placeCursor(rest.x, rest.y);

const onLabel = { x: 0.15, y: 0.5 };
const onChevron = { x: 0.93, y: 0.5 };
/** Opens the nth editor select and picks an option, clicked left of its label. */
async function choose(index, option) {
  await glideClick(page.getByRole("combobox").nth(index), 550, onChevron);
  const item = page.getByRole("option", { name: option, exact: true });
  await item.waitFor();
  await page.waitForTimeout(200);
  await glideClick(item, 420, { x: 0.06, y: 0.5 });
  await item.waitFor({ state: "hidden" });
  await page.waitForTimeout(150);
}
async function retype(input, text) {
  await glideClick(input, 550, { x: 0.8, y: 0.5 });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(text, { delay: 32 });
  await page.waitForTimeout(250);
}

await scene.record();
await page.waitForTimeout(1000);
await glideClick(page.getByText("New widget", { exact: true }), 1000, onLabel);
// Cut the editor load: resume once the preview chart (its date axis) is up.
const dateTick = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+$/;
await scene.cut(async () => {
  await page.getByText("Widget Configuration").waitFor();
  await page.getByText(dateTick).first().waitFor();
  await page.waitForTimeout(300);
});
await page.waitForTimeout(400);

const config = { x: 30, y: 170, width: 1097, height: 617 };
wide();
await choose(1, "Latency");
await choose(2, "P 95");
await choose(3, "Level");
await scene.cut(() =>
  page.getByText("WARNING", { exact: true }).first().waitFor(),
);
await page.waitForTimeout(300);
await retype(page.locator("#widget-name"), "Observation Latencies");
await page.waitForTimeout(500);
const save = page.getByRole("button", { name: "Save Widget" });
await glideClick(save, 900);
wide();
const toast = page.getByText("Widget created successfully");
await scene.cut(async () => {
  await toast.waitFor();
  await page.getByText("Observation Latencies").first().waitFor();
});
await glideTo(rest.x + 200, rest.y - 250, 700);
await page.waitForTimeout(1100);
await glideClick(
  page.locator("[data-sonner-toast]").getByRole("button").first(),
  600,
);
await scene.cut(() => toast.waitFor({ state: "hidden" }));
await page.evaluate(() => document.activeElement?.blur());
await glideTo(rest.x, rest.y, 800);
await page.waitForTimeout(900);
await scene.finish();
