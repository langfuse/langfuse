// Docs: /docs/observability/features/token-and-cost-tracking (custom model
// definitions). A generation on `grok-4-fast` has no price yet; its model
// badge opens "Create Model" prefilled with the name, match pattern and the
// generation's usage types. Enter prices and submit; new generations on that
// model are then priced.
import { openScene, seed } from "./lib.mjs";

// Re-seeding also deletes the project's `grok-4-fast` model from the last take.
const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// Re-seeding writes a second copy of each v4 event row until ClickHouse merges
// them; force the merge before filming.
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8124";
for (const table of ["events_full", "events_core"]) {
  await fetch(CLICKHOUSE_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa("clickhouse:clickhouse")}` },
    body: `OPTIMIZE TABLE ${table} FINAL`,
  });
}
const scene = await openScene("2025-10-20-custom-model-definition-169");
const { page, glideTo, glideClick, focus, wide } = scene;
const loaded = () =>
  page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, {
    timeout: 30_000,
  });

// links[3] is the route-ticket trace (see the scenario's link order).
await page.goto(links[3]);
await page.getByText("classify-ticket", { exact: true }).first().click();
const modelBadge = page.getByText("grok-4-fast", { exact: true }).last();
await modelBadge.waitFor();
await loaded();
await page.getByText("no cost").first().waitFor();
// The screencast can drop the last paint before the page goes idle; a
// near-invisible ticking pixel keeps frames coming.
await page.evaluate(() => {
  const style = document.createElement("style");
  style.textContent =
    "@keyframes demo-tick{from{opacity:0.01}to{opacity:0.02}}.demo-tick{position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;pointer-events:none;background:#000;animation:demo-tick .1s steps(2) infinite}";
  document.head.appendChild(style);
  const tick = document.createElement("div");
  tick.className = "demo-tick";
  document.body.appendChild(tick);
});
await page.waitForTimeout(800);
await scene.placeCursor(1180, 640);
await page.waitForTimeout(400);

const generationHeader = { x: 494, y: 110, width: 853, height: 480 };

await scene.record();
await page.waitForTimeout(1000);
wide();
const badgeBox = await modelBadge.boundingBox();
await glideTo(badgeBox.x + 40, badgeBox.y + 70, 900);
focus(generationHeader, 1.8);
await page.waitForTimeout(600);
await glideClick(modelBadge, 450, { x: 0.15, y: 0.5 });
const dialog = page.getByRole("dialog");
await dialog.getByText("Create Model").waitFor();
// Zoom back out so the whole form is visible while it is filled in.
focus(generationHeader, 1.8);
await glideTo(900, 470, 700);
wide();
await page.waitForTimeout(900);

// grok-4-fast list prices: $0.20 / 1M input, $0.50 / 1M output tokens.
const priceInputs = dialog.getByPlaceholder(/price/i);
const priceFields = (await priceInputs.count())
  ? priceInputs
  : dialog.locator('input[type="number"], input[inputmode="decimal"]');
for (const [index, price] of ["0.0000002", "0.0000005"].entries()) {
  const field = priceFields.nth(index);
  await glideClick(field, 550, { x: 0.85, y: 0.5 });
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(price, { delay: 45 });
  await page.waitForTimeout(300);
}
// Scroll to the price preview.
await glideTo(760, 560, 500);
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(35);
}
await page.waitForTimeout(1800);

const submit = dialog.getByRole("button", { name: "Submit" });
const submitBox = await submit.boundingBox();
await glideTo(submitBox.x - 30, submitBox.y - 40, 800);
await glideClick(submit, 400);
// Submitting opens the new model's page; skip the server round trip and
// clear its toasts (the "Model created" confirmation, and a slow-query
// warning the local observations table can raise) without moving the cursor.
await scene.cut(async () => {
  await page.waitForURL(/settings\/models\//, { timeout: 60_000 });
  await page.getByText("Model configuration").first().waitFor();
  await loaded();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  const toasts = page.locator("[data-sonner-toast]");
  for (let i = 0; i < 5 && (await toasts.count()); i++) {
    await toasts
      .first()
      .getByRole("button")
      .first()
      .evaluate((button) => button.click())
      .catch(() => {});
    await page.waitForTimeout(400);
  }
});
await glideTo(1180, 640, 900);
await page.waitForTimeout(2600);
// Back to the trace the take started on, so the loop closes.
await scene.cut(async () => {
  await page.goBack();
  await page.getByText("no cost").first().waitFor();
  await loaded();
  await page.waitForTimeout(800);
});
await page.waitForTimeout(1200);
await scene.finish();
