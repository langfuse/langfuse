// Docs: /docs/observability/features/events-table-charts.
// Filters the observations table to generations, switches Table > Chart,
// plots p95 latency per model as a ranked chart, and opens "Add to
// dashboard". The dialog is closed again, so no widget is created.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const tracingUrl = "http://localhost:3000/project/docs-demo/observations";
const FILTER = "type:GENERATION";

const scene = await openScene("chart-any-table");
const { page, glideTo, glideClick, wide } = scene;

const search = page.getByRole("combobox", { name: "Search" }).first();
const tableTab = page.getByRole("tab", { name: "Table" });
const chartTab = page.getByRole("tab", { name: "Chart" });
const tableLoaded = async () => {
  await search.waitFor({ timeout: 60_000 });
  await page.getByText("Start Time").first().waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
};
// Table mode with an empty search: the filter and view mode survive reloads.
const reset = async () => {
  await page.goto(tracingUrl);
  await search.waitFor({ timeout: 60_000 });
  if ((await chartTab.getAttribute("aria-selected")) === "true") {
    await tableTab.click();
  }
  await tableLoaded();
  if (
    (await page.getByRole("search").first().innerText()).includes(":GENERATION")
  ) {
    await search.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await page.evaluate(() => document.activeElement?.blur());
    await skeletonsGone(page, 60_000);
  }
};
const chartDrawn = async () => {
  await page
    .getByRole("group", { name: / chart$/i })
    .first()
    .waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
  await page.waitForTimeout(600);
};
const pick = async (combobox, option) => {
  await glideClick(page.getByRole("combobox", { name: combobox }), 800, {
    x: 0.3,
    y: 0.5,
  });
  const item = page.getByRole("option", { name: option, exact: true });
  await item.waitFor();
  await page.waitForTimeout(500);
  await glideClick(item, 600, { x: 0.25, y: 0.5 });
};

// Compile the chart route once so its first render is not on camera.
await page.goto(tracingUrl);
await tableLoaded();
await chartTab.click();
await chartDrawn();
await reset();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 640);

await page.getByText(/^Total\s≈\s\d+$/).waitFor({ timeout: 60_000 });
const totalBefore = await page.getByText(/^Total\s≈\s\d+$/).innerText();
console.log("rows before filter:", totalBefore);

await scene.record();
await page.waitForTimeout(900);
wide();
await glideClick(search, 900, { x: 0.3, y: 0.5 });
await page.keyboard.type(FILTER, { delay: 60 });
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await scene.cut(async () => {
  // The row count drops once only generations are left.
  await page
    .getByText(totalBefore, { exact: true })
    .waitFor({ state: "hidden", timeout: 60_000 });
  await page.getByText(/^Total\s≈\s\d+$/).waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
  await page.keyboard.press("Escape");
});
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1100);

await glideClick(chartTab, 900, { x: 0.5, y: 0.5 });
await scene.cut(chartDrawn);
await page.waitForTimeout(1500);

await pick("Metric", "Latency");
await scene.cut(chartDrawn);
await page.waitForTimeout(900);
await pick("Aggregation", "p95");
await scene.cut(chartDrawn);
await page.waitForTimeout(900);
await glideClick(page.getByRole("tab", { name: "Ranked" }), 800);
await scene.cut(chartDrawn);
await page.waitForTimeout(2000);

await glideClick(page.getByRole("button", { name: "Add to dashboard" }), 900, {
  x: 0.5,
  y: 0.5,
});
const dialog = page.getByRole("dialog", {
  name: "Select dashboard to add widget to",
});
await dialog.getByRole("row").nth(1).waitFor();
await page.waitForTimeout(900);
await glideClick(dialog.getByRole("row").nth(1), 800, { x: 0.2, y: 0.5 });
await page.waitForTimeout(1400);
await glideTo(1000, 760, 700);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

await scene.cut(async () => {
  await reset();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
