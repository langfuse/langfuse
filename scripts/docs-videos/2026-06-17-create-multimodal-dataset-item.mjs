// Docs: /docs/evaluation/experiments/datasets ("Multi-modal dataset items").
// Creates a support-screenshots item whose input attaches a checkout
// screenshot (fixtures/checkout-error.png) through the editor's attach button.
// Needs media uploads (MinIO in the dev compose stack).
import path from "node:path";
import { openScene, seed } from "./lib.mjs";

const IMAGE = path.join(import.meta.dirname, "fixtures/checkout-error.png");
// Re-seeding removes the item a previous take added.
const reset = () => seed("docs-demo-datasets", ["--project", "docs-demo"]);
const { links } = reset();
const scene = await openScene("2026-06-17-create-multimodal-dataset-item");
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

const newItem = page.getByRole("button", { name: "New item" });
const dialog = page.getByRole("dialog");
const fields = page.locator(".cm-content");
const attachInput = dialog
  .locator("button")
  .filter({ has: page.locator("svg.lucide-paperclip") })
  .first();

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

// Warm-up off camera: the first upload and save in a dev server are slow.
await page.goto(links[3]);
await newItem.click();
await fields.first().click();
await page.keyboard.type('{"screenshot": ');
const [warmChooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  attachInput.click(),
]);
await warmChooser.setFiles(IMAGE);
await page.getByText("PNG", { exact: true }).first().waitFor();
await page.keyboard.type("}");
await page.getByRole("button", { name: "Add to dataset" }).click();
await dialog.waitFor({ state: "hidden", timeout: 60_000 });
reset();
await page.reload();
await page.getByText("blank after logging in").first().waitFor();
await page.waitForTimeout(1500);
const rest = { x: 1100, y: 640 };
await scene.placeCursor(rest.x, rest.y);

const newItemBox = await newItem.boundingBox();
const headerActions = { x: 980, y: 0, width: 556, height: 312 };
const inputEditor = { x: 330, y: 200, width: 880, height: 495 };

await scene.record();
await page.waitForTimeout(1000);
await glideTo(newItemBox.x - 80, newItemBox.y + 110, 850);
await glideClick(newItem, 450, { x: 0.15, y: 0.5 });
await scene.cut(async () => {
  await fields.nth(1).waitFor();
  await page.getByText('"answer": "London"').first().waitFor();
  await page.waitForTimeout(300);
});

await glideTo(600, 330, 700);
await glideClick(fields.nth(0), 300, { x: 0.25, y: 0.1 });
await typeChunks('{"question": "Why does my payment fail?", "screenshot": ');
await page.waitForTimeout(250);
const [chooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  glideClick(attachInput, 650),
]);
await chooser.setFiles(IMAGE);
const chip = page.getByText("PNG", { exact: true }).first();
await scene.cut(() => chip.waitFor({ timeout: 60_000 }));
await page.keyboard.type("}", { delay: 40 });
await page.waitForTimeout(300);
// Hovering the attachment chip previews the uploaded image.
const chipBox = await chip.boundingBox();
await glideTo(
  chipBox.x + chipBox.width * 0.85,
  chipBox.y + chipBox.height * 0.6,
  700,
);
await page.getByText("image/png").first().waitFor();
await page.waitForTimeout(1800);
// Hold the editor framing until the camera moves on to the submit button.

const submit = page.getByRole("button", { name: "Add to dataset" });
const submitBox = await submit.boundingBox();
// Glide first, then mark the camera's arrival on the submit button.
await glideTo(
  submitBox.x + submitBox.width * 0.2,
  submitBox.y + submitBox.height / 2,
  900,
);
await glideClick(submit, 250, { x: 0.2, y: 0.5 });
await scene.cut(async () => {
  await dialog.waitFor({ state: "hidden", timeout: 60_000 });
  await page.getByText("Why does my payment fail?").first().waitFor();
  await page.waitForTimeout(300);
});
await repaint();
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(400);
wide();
await glideTo(rest.x, rest.y, 900);
await page.waitForTimeout(1800);
await scene.finish();
