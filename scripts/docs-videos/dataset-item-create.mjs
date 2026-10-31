// Docs: /docs/evaluation/get-started/offline ("Add item" tab).
// Adds the Coit Tower question to the quickstart's san-francisco-sites
// dataset through the "New item" dialog.
import { openScene, seed } from "./lib.mjs";

// Re-seeding resets the dataset to its four seeded items.
const { links } = seed("docs-demo-datasets", ["--project", "docs-demo"]);
const scene = await openScene("dataset-item-create");
const { page, glideTo, glideClick, wide } = scene;

/**
 * Types in small chunks: per-key typing into the JSON editor slows to a crawl
 * on a busy dev server, while chunks still read as live typing.
 */
const typeChunks = async (text, ms = 70) => {
  for (const chunk of text.match(/.{1,4}/g)) {
    await page.keyboard.insertText(chunk);
    await page.waitForTimeout(ms);
  }
};

// Warm-up take: the first save in a dev server is slow, so create one
// throwaway item off camera, then re-seed to drop it again.
await page.goto(links[0]);
await page.getByRole("button", { name: "New item" }).click();
await page.locator(".cm-content").first().click();
await page.keyboard.type('{"question": "warm-up"}');
await page.getByRole("button", { name: "Add to dataset" }).click();
await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 60_000 });
seed("docs-demo-datasets", ["--project", "docs-demo"]);
await page.reload();
await page.getByText("Golden Gate Bridge").first().waitFor();
await page.waitForTimeout(1500);
await scene.placeCursor(1300, 720);

const newItem = page.getByRole("button", { name: "New item" });
const newItemBox = await newItem.boundingBox();
const headerActions = { x: 980, y: 0, width: 556, height: 312 };
const editors = { x: 390, y: 210, width: 760, height: 428 };

await scene.record();
await page.waitForTimeout(1000);
await glideTo(newItemBox.x - 80, newItemBox.y + 110, 900);
await glideClick(newItem, 450, { x: 0.15, y: 0.5 });

const fields = page.locator(".cm-content");
await scene.cut(async () => {
  await fields.nth(1).waitFor();
  await page.getByText('"answer": "London"').first().waitFor();
  await page.waitForTimeout(300);
});
await glideTo(560, 360, 800);
await glideClick(fields.nth(0), 350, { x: 0.3, y: 0.1 });
await typeChunks(
  '{"question": "Which Art Deco tower stands on Telegraph Hill?"}',
);
await page.waitForTimeout(300);
await glideClick(fields.nth(1), 600, { x: 0.3, y: 0.1 });
await typeChunks('"Coit Tower"');
await page.waitForTimeout(700);
// Hold the editor framing until the camera moves on to the submit button.

const submit = page.getByRole("button", { name: "Add to dataset" });
const submitBox = await submit.boundingBox();
// Glide first, then mark the camera's arrival on the submit button.
await glideTo(
  submitBox.x + submitBox.width * 0.2,
  submitBox.y + submitBox.height / 2,
  800,
);
await glideClick(submit, 250, { x: 0.2, y: 0.5 });
await scene.cut(async () => {
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 60_000 });
  await page.getByText("Coit Tower").first().waitFor();
});
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(400);
await glideTo(1300, 720, 1000);
wide();
await page.waitForTimeout(2000);
await scene.finish();
