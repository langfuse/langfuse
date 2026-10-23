// Docs: /docs/evaluation/evaluation-methods/llm-as-a-judge. Creates an
// LLM-as-a-judge evaluator from the "Classify Input Topic" template: filter
// the sample to the support chatbot, map {{input}} to payload.message, run the
// judge on one sample (real model call through the project's LLM
// connection), and save the evaluator.
import { openScene, seed } from "./lib.mjs";

const NAME = process.env.SCENE_NAME ?? "2026-08-21-evaluator-llmaaj-setup";
// Removes the evaluator (and its rule) created by earlier takes.
seed("docs-demo-evals", ["--project", "docs-demo"]);
const scene = await openScene(NAME);
const { page, glideTo, glideClick, wide } = scene;
const project = "http://localhost:3000/project/docs-demo";

// Warm up the setup page so the dev server has compiled it.
await page.goto(`${project}/evals/new?template=topic-classifier`);
await page.getByText("Matching observations").waitFor({ timeout: 90_000 });
await page.goto(`${project}/evals`);
const browse = page.getByText("Browse all templates");
await browse.waitFor({ timeout: 60_000 });
// Open and close the gallery once so the page is hydrated before the take.
await browse.click();
await page
  .getByPlaceholder("Search templates")
  .filter({ visible: true })
  .waitFor({ timeout: 60_000 });
await page.keyboard.press("Escape");
await page
  .getByPlaceholder("Search templates")
  .filter({ visible: true })
  .waitFor({ state: "hidden" });
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1000);
// The busy local dev server can time out the search bar's value
// suggestions; that error toast is an artifact of the shared stack, not the
// flow, so keep it out of the take.
await page.evaluate(() => {
  new MutationObserver(() => {
    for (const toast of document.querySelectorAll("[data-sonner-toast]")) {
      if (toast.textContent?.includes("Request Timed Out"))
        toast.style.display = "none";
    }
  }).observe(document.body, { childList: true, subtree: true });
});
await scene.placeCursor(1050, 640);
await page.waitForTimeout(300);

/** Scrolls smoothly with the wheel so the motion reads on camera. */
async function wheel(x, y, dy, steps = 8) {
  await page.mouse.move(x, y);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(35);
  }
}

await scene.record();
await page.waitForTimeout(1000);
wide();

// 1. Pick the template.
await glideClick(browse, 900, { x: 0.3, y: 0.5 });
const classifier = page.getByText("Classifier", { exact: true }).first();
await scene.cut(() => classifier.waitFor());
await page.waitForTimeout(300);
await glideClick(classifier, 650, { x: 0.1, y: 0.5 });
await page.waitForTimeout(450);
const template = page
  .getByText("Classify Input Topic", { exact: true })
  .first();
await glideClick(template, 650, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  await page.getByText("Matching observations").waitFor({ timeout: 90_000 });
  await page.getByText("Project default").waitFor({ timeout: 60_000 });
  // Rows render as skeletons first; wait for a real start time.
  await page
    .locator("tbody td")
    .filter({ hasText: /\d{4}-\d\d-\d\d/ })
    .first()
    .waitFor({ timeout: 60_000 });
});
await page.waitForTimeout(500);

// 2. Narrow the sample to the support chatbot's root spans.
const query = page.getByTestId("search-bar-input").last();
const qb = await query.boundingBox();
wide();
await glideTo(qb.x + qb.width - 40, qb.y + qb.height / 2, 900);
await page.waitForTimeout(120);
await page.mouse.click(qb.x + qb.width - 40, qb.y + qb.height / 2);
await page.keyboard.type("name:qa-chatbot", { delay: 45 });
await page.keyboard.press("Enter");
await page.keyboard.press("Escape");
await scene.cut(() =>
  page.locator("tbody").getByText("qa-chatbot").nth(6).waitFor(),
);
await page.waitForTimeout(600);
wide();

// 3. Map {{input}} to payload.message.
await wheel(520, 560, 520);
await page.waitForTimeout(500);
const mapsTo = page.getByText("maps to").first();
const mb = await mapsTo.boundingBox();
const mapArea = { x: 90, y: mb.y - 120, width: 840, height: 420 };
const pencil = { x: 898, y: mb.y + mb.height / 2 };
await glideTo(pencil.x, pencil.y, 800);
await page.waitForTimeout(140);
await page.mouse.click(pencil.x, pencil.y);
const hint = page.getByText("Click rows to open them");
await hint.waitFor();
await page.waitForTimeout(350);
const hb = await hint.boundingBox();
await glideTo(165, hb.y + 34, 500);
await page.mouse.click(165, hb.y + 34);
await page.waitForTimeout(350);
await glideClick(page.getByText("payload", { exact: true }).first(), 450, {
  x: 0.2,
  y: 0.5,
});
await page.waitForTimeout(350);
// Clicking a leaf field binds it (same as its "Use" button).
const message = page.getByText("message", { exact: true }).first();
await glideClick(message, 450, { x: 0.3, y: 0.5 });
await page.waitForTimeout(800);
wide();

// 4. Run the judge on the selected sample.
const run = page.getByRole("button", { name: /Run test on this sample/ });
const rb = await run.boundingBox();
await wheel(1230, 600, rb.y - 520);
await page.waitForTimeout(400);
const testArea = { x: 942, y: 380, width: 594, height: 440 };
await glideClick(run, 800, { x: 0.12, y: 0.5 });
// Keep a moment of the running state, then cut to the judge's answer.
await page.waitForTimeout(800);
await scene.cut(() =>
  page.getByText("Model reasoning").waitFor({ timeout: 90_000 }),
);
await page.waitForTimeout(500);
await wheel(1230, 600, 260, 6);
await glideTo(1300, 560, 600);
await page.waitForTimeout(1300);

// 5. Save it.
wide();
await glideClick(page.getByRole("button", { name: /Create evaluator/ }), 900, {
  x: 0.2,
  y: 0.5,
});
const execute = page.getByRole("button", { name: "Execute" });
await scene.cut(() => execute.waitFor({ timeout: 60_000 }));
await page.waitForTimeout(1000);
await glideClick(execute, 800);
await scene.cut(async () => {
  await page.waitForURL(/\/evals(\?|$)/, { timeout: 60_000 });
  await page
    .getByRole("row")
    .filter({ hasText: "Classify Input Topic" })
    .waitFor({ timeout: 60_000 });
});
await page.waitForTimeout(800);
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1050, 640, 900);
await page.waitForTimeout(900);
await scene.finish();
