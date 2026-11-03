// Docs: /faq/all/explore-observations-in-v4 and the v3-to-v4 upgrade guide.
// Tracing table: filter with the search bar, save the filter as a custom
// view, clear the filter, and bring it back by opening the view. docs-demo-project
// removes the saved view again.
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
const VIEW = "Slow support replies";
const FILTER = "name:draft-reply latency:>2";

const scene = await openScene("2026-03-10-demo-saved-views");
const { page, glideTo, glideClick, wide } = scene;

const search = page.getByRole("combobox", { name: "Search" }).first();
const myViews = page.getByRole("button", { name: /My Views|Slow support/ });
const tableLoaded = async () => {
  await search.waitFor({ timeout: 60_000 });
  await page.getByText("Start Time").first().waitFor();
  await skeletonsGone(page, 60_000);
};
const filtered = () =>
  page.waitForFunction(
    () => {
      const rows = [...document.querySelectorAll("tbody tr")].slice(0, 6);
      return (
        rows.length > 2 &&
        rows.every((r) => r.innerText.includes("draft-reply"))
      );
    },
    null,
    { timeout: 60_000 },
  );

await page.goto(tracingUrl);
await tableLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(900);
wide();
// Filter to slow drafted replies.
await glideClick(search, 900, { x: 0.3, y: 0.5 });
await page.keyboard.type(FILTER, { delay: 55 });
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await scene.cut(async () => {
  await filtered();
  await skeletonsGone(page, 60_000);
});
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1400);

// Save it as a view.
await glideClick(myViews.first(), 800, { x: 0.4, y: 0.5 });
const createView = page.getByRole("button", { name: "Create Custom View" });
await createView.waitFor();
await page.waitForTimeout(600);
await glideClick(createView, 700, { x: 0.2, y: 0.5 });
const dialog = page.getByRole("dialog").last();
const nameInput = dialog.locator("input").first();
await nameInput.waitFor();
await page.waitForTimeout(400);
await glideClick(nameInput, 600, { x: 0.3, y: 0.5 });
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type(VIEW, { delay: 55 });
await page.waitForTimeout(500);
const save = dialog.getByRole("button", { name: /Save|Create/ }).last();
await glideClick(save, 700, { x: 0.4, y: 0.5 });
// Saving applies the view: the views button now carries its name.
await scene.cut(async () => {
  await page
    .getByRole("button", { name: new RegExp(VIEW) })
    .first()
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
});
await page.waitForTimeout(1400);

// Clear the filter, then bring it back by opening the saved view.
await glideClick(search, 800, { x: 0.3, y: 0.5 });
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.press("Backspace");
await page.keyboard.press("Enter");
await scene.cut(async () => {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("tbody tr")]
        .slice(0, 8)
        .every((r) => r.innerText.includes("draft-reply")),
    null,
    { timeout: 60_000 },
  );
  await skeletonsGone(page, 60_000);
});
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1200);
await glideClick(myViews.first(), 800, { x: 0.4, y: 0.5 });
const savedView = page.getByRole("option", { name: new RegExp(VIEW) }).first();
await savedView.waitFor();
await page.waitForTimeout(500);
await glideClick(savedView, 700, { x: 0.2, y: 0.5 });
await scene.cut(async () => {
  await filtered();
  await skeletonsGone(page, 60_000);
});
await page.keyboard.press("Escape");
await glideTo(1000, 600, 800);
await page.waitForTimeout(1800);

await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(tracingUrl);
  await tableLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
