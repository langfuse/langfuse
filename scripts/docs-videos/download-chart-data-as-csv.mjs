// Docs: /docs/metrics/features/custom-dashboards ("Data Export").
// Downloads the "Total costs" widget of the curated cost dashboard as CSV.
import { openScene, seed } from "./lib.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const scene = await openScene("download-chart-data-as-csv");
const { page, glideTo, glideClick, focus, wide } = scene;

// Curated "Langfuse Cost Dashboard" (Langfuse-maintained, shown in every project).
await page.goto(
  "http://localhost:3000/project/docs-demo/dashboards/cmawoi7yd00aqad07f3why08w?dateRange=7d",
);
await page.getByText("Total costs", { exact: true }).waitFor();
await page.getByText("cust-", { exact: false }).first().waitFor();
await page.waitForTimeout(4000);
// A slow query on the shared dev stack can raise a timeout toast; clear it.
const timedOut = page.getByText("Request Timed Out");
if (await timedOut.isVisible()) {
  await page.reload();
  await page.getByText("cust-", { exact: false }).first().waitFor();
  await page.waitForTimeout(4000);
}
const title = await page
  .getByText("Total costs", { exact: true })
  .first()
  .boundingBox();
// Widget controls only render while the card is hovered.
await page.mouse.move(title.x + 160, title.y + 8);
await page.waitForTimeout(300);
const actions = page.getByRole("button", { name: "Widget actions" });
let menuButton = null;
for (let i = 0; i < (await actions.count()); i++) {
  const box = await actions.nth(i).boundingBox();
  if (box && Math.abs(box.y - title.y) < 20 && box.x > title.x) {
    menuButton = actions.nth(i);
    break;
  }
}
// Rest in the empty header strip: no card hover controls or chart tooltips.
const rest = { x: 860, y: 66 };
await scene.placeCursor(rest.x, rest.y);
await page.waitForTimeout(500);
const widgetArea = { x: 24, y: 96, width: 1024, height: 576 };
const downloads = [];
page.on("download", (download) => downloads.push(download));

await scene.record();
await page.waitForTimeout(1000);
// Hold the wide frame before the camera moves in.
wide();
await glideTo(title.x + 160, title.y + 8, 900);
focus(widgetArea, 1.5);
await page.waitForTimeout(400);
await glideClick(menuButton, 500);
const csvItem = page.getByRole("menuitem", { name: "Download data as CSV" });
await csvItem.waitFor();
await page.waitForTimeout(600);
// The menu closes over the chart, and a pointer resting there pops a chart
// tooltip. So the drawn cursor clicks the item while the real pointer waits in
// the gap above the card; the item is selected programmatically.
const exit = { x: title.x + 300, y: title.y - 27 };
const item = await csvItem.boundingBox();
const at = { x: item.x + item.width * 0.08, y: item.y + item.height / 2 };
await glideTo(at.x, at.y, 550);
await page.waitForTimeout(140);
await page.mouse.move(exit.x, exit.y);
await page.evaluate(({ x, y }) => {
  dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y }));
}, at);
await csvItem.evaluate((el) => el.click());
await csvItem.waitFor({ state: "hidden" });
// Re-enter and leave the card once the menu is gone, so it registers the
// pointer leaving and hides its hover controls.
await page.waitForTimeout(200);
await page.mouse.move(title.x + 260, title.y + 8, { steps: 3 });
await page.mouse.move(exit.x, exit.y, { steps: 3 });
await page.waitForTimeout(300);
await page.evaluate(() => document.activeElement?.blur());
// Leave through the gap above the card, clear of chart tooltips.
await glideTo(exit.x, exit.y, 600);
focus(widgetArea, 1.5);
await glideTo(rest.x, rest.y, 900);
wide();
// The closed menu hands focus back to its trigger, which keeps the card's
// controls visible; drop it so the last frame matches the first.
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1000);
if (downloads.length !== 1) throw new Error("expected one CSV download");
console.log(`downloaded ${downloads[0].suggestedFilename()}`);
await scene.finish();
