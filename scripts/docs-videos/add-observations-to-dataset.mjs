// Docs: /changelog/2025-12-11-batch-add-observations-to-dataset.
// Narrows the observations table to order-status replies, selects three,
// and adds them to the support-replies dataset with the default mapping
// (input -> input, output -> expected output), then opens the dataset.
// docs-demo-datasets rewrites the dataset's items again.
import { openScene, seed } from "./lib.mjs";
import { clearSidebarFilters, facetOnly } from "./sidebar-helpers.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
seed("docs-demo-datasets", ["--project", "docs-demo"]);
const base = "http://localhost:3000/project/docs-demo";
const tracingUrl = `${base}/observations`;

const scene = await openScene("add-observations-to-dataset");
const { page, glideTo, glideClick, wide } = scene;

const tableLoaded = async () => {
  await page.getByText("Start Time").first().waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
};
const reset = async () => {
  await page.goto(tracingUrl);
  await tableLoaded();
  await clearSidebarFilters(page);
  await tableLoaded();
};

// Compile the datasets route once.
await page.goto(`${base}/datasets`);
await page.getByText("support-replies").first().waitFor({ timeout: 60_000 });
await reset();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(900);
wide();
await facetOnly(scene, "Name", "order-status");
await scene.cut(async () => {
  await page.waitForTimeout(700);
  await skeletonsGone(page, 60_000);
});
await page.waitForTimeout(1200);

const rows = page.locator("tbody tr");
for (let i = 0; i < 3; i++) {
  await glideClick(rows.nth(i).getByRole("checkbox"), i === 0 ? 900 : 450);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(700);
await glideClick(page.getByRole("button", { name: "Add to Dataset" }), 900);
const dialog = page.getByRole("dialog", { name: /Add 3 observations/ });
await dialog.waitFor();
await page.waitForTimeout(1000);
await glideClick(dialog.getByRole("combobox").first(), 800, {
  x: 0.3,
  y: 0.5,
});
const target = page.getByText("support-replies", { exact: true }).last();
await target.waitFor();
await page.waitForTimeout(500);
await glideClick(target, 600, { x: 0.25, y: 0.5 });
await page.waitForTimeout(1400);
await glideClick(
  dialog.getByRole("button", { name: "Add 3 observations" }),
  900,
);
await scene.cut(async () => {
  await page.getByText("Successfully Added!").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
});
await page.waitForTimeout(1500);

// The new items in the dataset.
// "Go to Dataset" opens a new tab; follow it in this one.
const popup = page.context().waitForEvent("page", { timeout: 10_000 });
await glideClick(page.getByRole("button", { name: "Go to Dataset" }), 900);
await scene.cut(async () => {
  const tab = await popup.catch(() => null);
  if (tab) {
    await tab.waitForLoadState();
    const url = tab.url();
    await tab.close();
    await page.goto(url);
  }
  await page
    .getByText("Where is my order")
    .first()
    .waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
  await page.waitForTimeout(500);
});
await page.waitForTimeout(2600);

await glideTo(1000, 640, 800);
await scene.cut(async () => {
  seed("docs-demo-datasets", ["--project", "docs-demo"]);
  await reset();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
