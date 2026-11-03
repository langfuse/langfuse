// Docs: /changelog/2026-09-07-evaluator-backfills.
// Saves an LLM-as-a-judge evaluator and backfills it: "Run evaluator on past
// observations matching these filters" scores the newest 20 matching
// observations from the last 30 days. The evaluator is configured off camera
// with the steps of 2026-08-21-evaluator-llmaaj-setup (template, filter,
// mapping); the take starts at "Create evaluator". Needs the worker and an
// LLM connection for the scores to arrive.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

// Removes the evaluator (and its rule) created by earlier takes.
seed("docs-demo-evals", ["--project", "docs-demo"]);
const scene = await openScene("evaluator-backfill");
const { page, glideTo, glideClick, wide } = scene;
const project = "http://localhost:3000/project/docs-demo";

// --- Off camera: the evaluator from the "Classify Input Topic" template ---
await page.goto(`${project}/evals/new?template=topic-classifier`);
await page.getByText("Matching observations").waitFor({ timeout: 90_000 });
await page.getByText("Project default").waitFor({ timeout: 60_000 });
await page
  .locator("tbody td")
  .filter({ hasText: /\d{4}-\d\d-\d\d/ })
  .first()
  .waitFor({ timeout: 60_000 });
const query = page.getByTestId("search-bar-input").last();
await query.click();
await page.keyboard.type("name:qa-chatbot");
await page.keyboard.press("Enter");
await page.keyboard.press("Escape");
await page.locator("tbody").getByText("qa-chatbot").nth(6).waitFor();
// Map {{input}} to payload.message.
const mapsTo = page.getByText("maps to").first();
await mapsTo.scrollIntoViewIfNeeded();
const mb = await mapsTo.boundingBox();
await page.mouse.click(898, mb.y + mb.height / 2);
const hint = page.getByText("Click rows to open them");
await hint.waitFor();
const hb = await hint.boundingBox();
await page.mouse.click(165, hb.y + 34);
await page.getByText("payload", { exact: true }).first().click();
await page.getByText("message", { exact: true }).first().click();
await page.waitForTimeout(800);
const createButton = page.getByRole("button", { name: /Create evaluator/ });
await createButton.scrollIntoViewIfNeeded();
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1200);
const cb = await createButton.boundingBox();
await scene.placeCursor(cb.x + cb.width / 2 - 200, cb.y - 120);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(createButton, 900, { x: 0.2, y: 0.5 });
const execute = page.getByRole("button", { name: "Execute" });
await scene.cut(() => execute.waitFor({ timeout: 60_000 }));
await page.waitForTimeout(900);

// Backfill: score past matches, not only new ones.
await glideClick(
  page.getByText("Run evaluator on past observations matching these filters"),
  900,
  { x: 0.1, y: 0.5 },
);
const maxItems = page.getByRole("spinbutton", { name: "Max items" });
await maxItems.waitFor();
await page.waitForTimeout(600);
await glideClick(maxItems, 700, { x: 0.5, y: 0.5 });
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type("20", { delay: 110 });
await page.waitForTimeout(400);
await glideClick(
  page.getByRole("combobox", { name: "Backfill time window" }),
  800,
  { x: 0.4, y: 0.5 },
);
const month = page.getByText("Last 30 days", { exact: true }).last();
await month.waitFor();
await page.waitForTimeout(450);
await glideClick(month, 600, { x: 0.3, y: 0.5 });
await page.waitForTimeout(1300);
await glideClick(execute, 900);
await scene.cut(async () => {
  await page.waitForURL(/\/evals(\?|$)/, { timeout: 60_000 });
  await page
    .getByRole("row")
    .filter({ hasText: "Classify Input Topic" })
    .waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
});
await page.waitForTimeout(1800);

// The backfilled scores on the matching observations.
await scene.cut(async () => {
  for (let i = 0; i < 30; i++) {
    await page.goto(`${project}/scores`);
    await page.getByText("Name").first().waitFor({ timeout: 60_000 });
    await skeletonsGone(page, 60_000);
    if (await page.getByText(/topic/i).first().isVisible()) break;
    await page.waitForTimeout(4000);
  }
  await page.waitForTimeout(500);
});
await page.waitForTimeout(2600);
await scene.finish();
