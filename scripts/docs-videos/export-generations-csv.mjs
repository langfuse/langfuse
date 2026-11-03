// Docs: /docs/api-and-data-platform/features/export-from-ui.
// Filters the tracing table, exports it as CSV, and opens Project Settings >
// Exports, where the finished file is ready to download. Needs the worker
// running (it writes the file to blob storage). docs-demo-project removes
// the export again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const base = "http://localhost:3000/project/docs-demo";
const tracingUrl = `${base}/observations`;
const FILTER = "name:draft-reply latency:>2";

const scene = await openScene("export-generations-csv");
const { page, glideTo, glideClick, wide } = scene;

const search = page.getByRole("combobox", { name: "Search" }).first();
const exportButton = page.getByRole("button", { name: "Export" });
const tableLoaded = async () => {
  await search.waitFor({ timeout: 60_000 });
  await page.getByText("Start Time").first().waitFor();
  await skeletonsGone(page, 60_000);
};

// Compile the exports settings route once.
await page.goto(`${base}/settings/exports`);
await page.getByText("Export large datasets").waitFor({ timeout: 60_000 });
await page.goto(tracingUrl);
await tableLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(900);
wide();
await glideClick(search, 900, { x: 0.3, y: 0.5 });
await page.keyboard.type(FILTER, { delay: 55 });
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await scene.cut(async () => {
  await page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll("tbody tr")].slice(0, 4);
      return (
        rows.length > 1 &&
        rows.every((r) => r.innerText.includes("draft-reply"))
      );
    },
    null,
    { timeout: 60_000 },
  );
  await skeletonsGone(page, 60_000);
});
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1200);

// Export the filtered rows as CSV.
await glideClick(exportButton, 900, { x: 0.5, y: 0.5 });
const asCsv = page.getByRole("menuitem", { name: "As CSV" });
await asCsv.waitFor();
await page.waitForTimeout(700);
await glideClick(asCsv, 600, { x: 0.2, y: 0.5 });
const toast = page.locator("[data-sonner-toast]").first();
await scene.cut(() => toast.waitFor({ timeout: 30_000 }));
await page.waitForTimeout(1600);

// The toast links to Project Settings > Exports.
await glideClick(toast.getByText(/View exports/), 800, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  // The worker writes the file in the background; reload until it is ready.
  const ready = page
    .getByRole("link", { name: /Download/ })
    .or(page.getByRole("button", { name: /Download/ }))
    .first();
  for (let attempt = 0; attempt < 24; attempt++) {
    if (attempt > 0) await page.goto(`${base}/settings/exports`);
    await page.getByText("Export large datasets").waitFor({ timeout: 60_000 });
    try {
      await ready.waitFor({ timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt === 23) throw error;
    }
  }
  await skeletonsGone(page);
  await page.waitForTimeout(500);
});
const download = page
  .getByRole("link", { name: /Download/ })
  .or(page.getByRole("button", { name: /Download/ }))
  .first();
await glideTo(
  ...(await download
    .boundingBox()
    .then((b) => [b.x + b.width / 2, b.y + b.height / 2])),
  1000,
);
await page.waitForTimeout(2200);

// Back to the unfiltered table; the filter survives a reload, so clear it.
await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(tracingUrl);
  await tableLoaded();
  await search.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("tbody tr")]
        .slice(0, 8)
        .every((r) => r.innerText.includes("draft-reply")),
    null,
    { timeout: 60_000 },
  );
  await skeletonsGone(page, 60_000);
  await page.waitForTimeout(400);
});
await glideTo(1000, 600, 700);
await page.waitForTimeout(900);
await scene.finish();
