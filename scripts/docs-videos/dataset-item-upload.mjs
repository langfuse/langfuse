// Docs: /docs/evaluation/get-started/offline ("Import CSV" tab).
// Imports fixtures/san-francisco-sites.csv into the empty
// san-francisco-sites dataset and maps its columns by drag and drop.
import path from "node:path";
import { openScene, seed } from "./lib.mjs";

const CSV = path.join(import.meta.dirname, "fixtures/san-francisco-sites.csv");
const reset = () =>
  seed("docs-demo-datasets", ["--project", "docs-demo", "--sf-items", "0"]);

const { links } = reset();
const scene = await openScene("dataset-item-upload");
const { page, glideTo, glideClick, wide } = scene;

/** Tracks the cursor so drags can replay glideTo's curve as real moves. */
let cursor = { x: 0, y: 0 };
const moveTo = async (x, y, ms) => {
  await glideTo(x, y, ms);
  cursor = { x, y };
};

/**
 * Drags along the same eased arc lib.mjs records for the composited cursor,
 * so the dnd-kit overlay follows the drawn pointer.
 */
async function dragTo(x, y, ms) {
  const from = cursor;
  const dx = x - from.x;
  const dy = y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(0.12 * len, 60);
  const ctrl = {
    x: from.x + dx / 2 + (-dy / len) * bend,
    y: from.y + dy / 2 + (dx / len) * bend,
  };
  const glide = glideTo(x, y, ms);
  const t0 = Date.now();
  for (let k = 0; k < 1; k = (Date.now() - t0) / ms) {
    const e = k < 0.5 ? 4 * k ** 3 : 1 - (2 - 2 * k) ** 3 / 2;
    await page.mouse.move(
      (1 - e) ** 2 * from.x + 2 * (1 - e) * e * ctrl.x + e ** 2 * x,
      (1 - e) ** 2 * from.y + 2 * (1 - e) * e * ctrl.y + e ** 2 * y,
    );
    await page.waitForTimeout(16);
  }
  await glide;
  cursor = { x, y };
}

async function mapColumn(column, target) {
  const chip = await page.getByText(column, { exact: true }).boundingBox();
  const zone = await page.getByText(target, { exact: true }).boundingBox();
  await moveTo(chip.x + 24, chip.y + chip.height / 2, 650);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.move(cursor.x + 6, cursor.y + 4);
  await dragTo(zone.x + 260, zone.y + 62, 800);
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

// Warm-up import off camera (the first import in a dev server is slow).
await page.goto(links[0]);
await page.getByText("Add Manually").waitFor();
await page.waitForTimeout(1500);
await page.getByText("Upload CSV").first().click();
await page.getByText("Upload a file").waitFor();
const [warmChooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.getByText("Upload a file").click(),
]);
await warmChooser.setFiles(CSV);
await page.getByText("Map to Dataset Items").waitFor();
await page.getByRole("button", { name: "Cancel" }).click();
reset();
await page.reload();

const uploadCard = page.getByText("Upload CSV").first();
await uploadCard.waitFor();
await page.waitForTimeout(1500);
const rest = { x: 1180, y: 760 };
// The upload dialog spans almost the whole viewport; 1.18x keeps it whole.
const dialog = { x: 117, y: 66, width: 1302, height: 732 };
await scene.placeCursor(rest.x, rest.y);
cursor = rest;

await scene.record();
await page.waitForTimeout(1000);
const card = await uploadCard.boundingBox();
await moveTo(card.x + 140, card.y + 60, 850);
await glideClick(uploadCard, 450, { x: 0.3, y: 0.5 });
cursor = { x: card.x + card.width * 0.3, y: card.y + card.height / 2 };

const dropzone = page.getByText("Upload a file");
await dropzone.waitFor();
await page.waitForTimeout(500);
const zone = await dropzone.boundingBox();
const [chooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  glideClick(dropzone, 700),
]);
cursor = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
await chooser.setFiles(CSV);
await scene.cut(() => page.getByText("Map to Dataset Items").waitFor());
await page.waitForTimeout(700);

await mapColumn("input", "Input");
await mapColumn("expected_output", "Expected Output");
await mapColumn("metadata", "Metadata");
await page.waitForTimeout(500);

const importButton = page.getByRole("button", { name: "Import" });
const importBox = await importButton.boundingBox();
await moveTo(importBox.x - 40, importBox.y - 30, 600);
await glideClick(importButton, 350, { x: 0.25, y: 0.5 });
await scene.cut(async () => {
  await page
    .getByText("Map to Dataset Items")
    .waitFor({ state: "hidden", timeout: 60_000 });
  await page.getByText("Golden Gate Bridge").first().waitFor();
});
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(500);
wide();
await glideTo(rest.x, rest.y, 1000);
await page.waitForTimeout(2000);
await scene.finish();
