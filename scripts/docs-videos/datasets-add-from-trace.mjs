// Docs: /docs/evaluation/experiments/datasets ("Add from trace") and
// /docs/evaluation/get-started/offline ("Add from trace" tab).
// Saves the generate-reply generation of a support-chat trace to the
// support-replies dataset via "Add to" -> "Dataset".
import { openScene, seed } from "./lib.mjs";

// Re-seeding removes the item a previous take added.
const reset = () => seed("docs-demo-datasets", ["--project", "docs-demo"]);
const { links } = reset();
const scene = await openScene("datasets-add-from-trace");
const { page, glideTo, glideClick, focus, wide } = scene;

const addTo = page.getByRole("button", { name: /^Add to/ });
const dialogTitle = page.getByText("Add item to datasets");
const submit = page.getByRole("button", { name: "Add to dataset" });

/**
 * The screencast only emits on paint and can miss the last frame of a
 * closing dialog; flicker one near-invisible corner pixel to force a frame.
 */
const repaint = () =>
  page.evaluate(() => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,.03)";
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 120);
  });

async function openDialog() {
  await addTo.first().click();
  await page.getByRole("menuitem", { name: "Dataset", exact: true }).hover();
  await page.getByRole("menuitem", { name: "support-replies" }).click();
  await dialogTitle.waitFor();
}

await page.goto(links[2]);
await page.getByText("generate-reply").first().click();
// Warm-up save off camera (the first one in a dev server is slow).
await openDialog();
await submit.click();
await dialogTitle.waitFor({ state: "hidden", timeout: 60_000 });
reset();
await page.reload();
await page.getByText("generate-reply").first().click();
await page.getByText("You can change it in Settings").first().waitFor();
await page.waitForTimeout(1200);
const rest = { x: 880, y: 820 };
await scene.placeCursor(rest.x, rest.y);

const addToBox = await addTo.first().boundingBox();
const headerActions = { x: 1036, y: 120, width: 500, height: 281 };

await scene.record();
await page.waitForTimeout(1000);
await glideTo(addToBox.x - 60, addToBox.y + 120, 900);
focus(headerActions, 1.8);
await glideClick(addTo.first(), 450, { x: 0.15, y: 0.5 });
const datasetItem = page.getByRole("menuitem", {
  name: "Dataset",
  exact: true,
});
await datasetItem.waitFor();
await page.waitForTimeout(350);
const datasetBox = await datasetItem.boundingBox();
await glideTo(datasetBox.x + 16, datasetBox.y + datasetBox.height / 2, 450);
await datasetItem.hover();
const target = page.getByRole("menuitem", { name: "support-replies" });
await target.waitFor();
await page.waitForTimeout(500);
// Submenu items have no icon; click the padding right of the label.
await glideClick(target, 650, { x: 0.85, y: 0.5 });
focus(headerActions, 1.8);

await scene.cut(async () => {
  await dialogTitle.waitFor();
  await page.getByText('"role": "assistant"').first().waitFor();
  await page.waitForTimeout(300);
});
await page.waitForTimeout(400);
wide();
await glideTo(1000, 560, 900);
await page.waitForTimeout(1600);
const submitBox = await submit.boundingBox();
wide();
await glideTo(
  submitBox.x + submitBox.width * 0.2,
  submitBox.y + submitBox.height / 2,
  800,
);
await glideClick(submit, 250, { x: 0.2, y: 0.5 });
await scene.cut(async () => {
  await dialogTitle.waitFor({ state: "hidden", timeout: 60_000 });
  await page.waitForTimeout(300);
});
await repaint();
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(400);
wide();
await glideTo(rest.x, rest.y, 900);
await page.waitForTimeout(1500);
await scene.finish();
