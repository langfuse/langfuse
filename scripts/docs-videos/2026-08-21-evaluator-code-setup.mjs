// Docs: /docs/evaluation/evaluation-methods/code-evaluators. Sets up a code
// evaluator from the "Detect User Frustration (ALL CAPS)" template and runs
// it on a support-chat generation whose user message is written in capitals.
import { openScene, seed } from "./lib.mjs";

// Removes the evaluator (and its rule) created by earlier takes.
seed("docs-demo-evals", ["--project", "docs-demo"]);
const scene = await openScene("2026-08-21-evaluator-code-setup");
const { page, glideTo, glideClick, wide } = scene;
const project = "http://localhost:3000/project/docs-demo";

// Warm up the setup page so the dev server has compiled it.
await page.goto(`${project}/evals/new?template=all-caps`);
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

await scene.record();
await page.waitForTimeout(1000);
wide();

// 1. Pick the template.
await glideClick(browse, 900, { x: 0.3, y: 0.5 });
const search = page
  .getByPlaceholder("Search templates")
  .filter({ visible: true });
await scene.cut(() => search.waitFor());
await page.waitForTimeout(500);
await glideClick(search, 650, { x: 0.25, y: 0.5 });
await page.keyboard.type("caps", { delay: 60 });
const template = page
  .getByText("Detect User Frustration (ALL CAPS)", { exact: true })
  .first();
await template.waitFor();
await page.waitForTimeout(700);
await glideClick(template, 750, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  await page.getByText("Matching observations").waitFor({ timeout: 90_000 });
  // Rows render as skeletons first; wait for a real start time.
  await page
    .locator("tbody td")
    .filter({ hasText: /\d{4}-\d\d-\d\d/ })
    .first()
    .waitFor({ timeout: 60_000 });
});
await page.waitForTimeout(900);

// 2. Narrow the sample to the support chatbot's answer generations.
// The preset filters root spans; swap it for generations, then the name.
const chip = (label) =>
  page.getByRole("button", { name: label, exact: true }).first();
const query = page.getByTestId("search-bar-input").last();
wide();
const rootBox = await chip("Root spans").boundingBox();
await glideTo(rootBox.x + 18, rootBox.y + rootBox.height / 2, 900);
await page.waitForTimeout(140);
await page.mouse.down();
await page.waitForTimeout(90);
await page.mouse.up();
await page.waitForTimeout(500);
await glideClick(chip("Generations"), 500, { x: 0.12, y: 0.5 });
await page.waitForTimeout(600);
const qb = await query.boundingBox();
await glideTo(qb.x + qb.width - 40, qb.y + qb.height / 2, 600);
await page.waitForTimeout(120);
await page.mouse.click(qb.x + qb.width - 40, qb.y + qb.height / 2);
await page.keyboard.type("name:generate-answer", { delay: 40 });
await page.keyboard.press("Enter");
await page.keyboard.press("Escape");
await scene.cut(() =>
  page.locator("tbody").getByText("generate-answer").nth(6).waitFor(),
);
await page.waitForTimeout(700);
wide();

// 3. Run the code on the selected sample.
const run = page.getByRole("button", { name: /Run test on this sample/ });
const rb = await run.boundingBox();
await page.mouse.move(1230, 600);
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, (rb.y - 520) / 8);
  await page.waitForTimeout(35);
}
await page.waitForTimeout(400);
const testArea = { x: 942, y: 380, width: 594, height: 440 };
await glideClick(run, 800, { x: 0.12, y: 0.5 });
await page.waitForTimeout(500);
await scene.cut(() =>
  page.getByText(/uppercase of \d+ letters/).waitFor({ timeout: 90_000 }),
);
await page.waitForTimeout(400);
// Bring the whole result into the zoomed frame.
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 45);
  await page.waitForTimeout(35);
}
const output = await page.getByText("Code Output").boundingBox();
await glideTo(1380, output.y + 60, 600);
await page.waitForTimeout(1500);

// Saving needs a code-eval dispatcher (LANGFUSE_CODE_EVAL_DISPATCHER) on
// the deployment; without one "Create evaluator" is refused, so the take
// ends on the test result.
wide();
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1050, 640, 900);
await page.waitForTimeout(900);
await scene.finish();
