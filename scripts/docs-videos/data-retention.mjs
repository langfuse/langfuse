// Docs: /docs/administration/data-retention.
// Sets a 30-day data retention in Project Settings > General.
// docs-demo-project clears the setting again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const settingsUrl = "http://localhost:3000/project/docs-demo/settings";

const scene = await openScene("data-retention");
const { page, glideTo, glideClick, wide } = scene;

const heading = page.getByRole("heading", { name: "Data Retention" });
const settingsLoaded = async () => {
  await heading.waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
  await page.waitForTimeout(600);
};

await page.goto(settingsUrl);
await settingsLoaded();
await scene.placeCursor(1000, 520);

await scene.record();
await page.waitForTimeout(1000);
wide();

// The only number field on the page; its Save is the second one, after the
// project name's.
const days = page.getByRole("spinbutton").first();
await glideClick(days, 1000, { x: 0.1, y: 0.5 });
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type("30", { delay: 120 });
await page.waitForTimeout(600);
const save = page.getByRole("button", { name: "Save", exact: true }).nth(1);
await glideClick(save, 800);
const confirm = page
  .getByRole("dialog")
  .getByRole("button", { name: /^(Confirm|Save|Update)/ });
if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
  await page.waitForTimeout(800);
  await glideClick(confirm, 800);
}
await scene.cut(async () => {
  await page
    .getByText(/current retention is "30" days/)
    .first()
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
});
await page.waitForTimeout(2600);

await glideTo(1000, 520, 800);
await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(settingsUrl);
  await settingsLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
