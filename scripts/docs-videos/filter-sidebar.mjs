// Docs: /changelog/2025-11-03-filter-sidebar-for-tables.
// Narrows the observations table from the filter sidebar: "Only" on one
// name, then a model found through the sidebar's own search. Facet counts
// follow the filters already applied.
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
const tracingUrl = "http://localhost:3000/project/docs-demo/observations";

const scene = await openScene("filter-sidebar");
const { page, glideTo, glideClick, wide } = scene;

const tableLoaded = async () => {
  await page.getByText("Start Time").first().waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
};
const rowsSettle = async () => {
  await page.waitForTimeout(700);
  await skeletonsGone(page, 60_000);
};
const reset = async () => {
  await page.goto(tracingUrl);
  await tableLoaded();
  await clearSidebarFilters(page);
  await tableLoaded();
};

await reset();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(900);
wide();

await facetOnly(scene, "Name", "draft-reply");
await scene.cut(rowsSettle);
await page.waitForTimeout(1300);

// Find a facet that is further down the list.
const filterSearch = page.getByRole("textbox", { name: "Search filters" });
await glideClick(filterSearch, 900, { x: 0.3, y: 0.5 });
await page.keyboard.type("model", { delay: 70 });
await page.waitForTimeout(800);
const modelFacet = page.getByRole("button", {
  name: "Provided Model Name",
  exact: true,
});
if ((await modelFacet.getAttribute("aria-expanded")) !== "true") {
  await glideClick(modelFacet, 800, { x: 0.3, y: 0.5 });
  await page.waitForTimeout(900);
}
await facetOnly(scene, "Provided Model Name", "claude-sonnet-4-5");
await scene.cut(rowsSettle);
await page.waitForTimeout(2200);

await glideTo(1000, 640, 800);
await scene.cut(async () => {
  await reset();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
