// Docs: /docs/evaluation/experiments/compare-experiments.
// Two capital-cities experiments side by side: the summary shows the
// regression, a score filter narrows the items to the ones that got worse,
// and one of them is annotated in place from the comparison view.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-evals", ["--project", "docs-demo"]);
seed("docs-demo-datasets", ["--project", "docs-demo"]);
const compareUrl =
  "http://localhost:3000/project/docs-demo/experiments/results?baseline=docs-demo-run-asking-specifically&c=docs-demo-run-directly-ask";
// Scoped to the compared run: items whose similarity dropped below 0.2.
const FILTER = '"directly-ask".scores.similarity:<0.2';

const scene = await openScene("compare-experiments");
const { page, glideTo, glideClick, wide } = scene;

const search = page.getByRole("combobox", { name: "Search" }).first();
const compareLoaded = async () => {
  await page.getByText("SUMMARY").first().waitFor({ timeout: 60_000 });
  await page.getByText('"Australia"').first().waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
  await page.waitForTimeout(600);
};
const clearSearch = async () => {
  if (!(await page.getByRole("search").first().innerText()).includes(":")) {
    return;
  }
  await search.click();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
  await skeletonsGone(page, 60_000);
};

await page.goto(compareUrl);
await compareLoaded();
await clearSearch();
await page.goto(compareUrl);
await compareLoaded();
await scene.placeCursor(1180, 845);

await scene.record();
await page.waitForTimeout(1200);
wide();
// The summary: exact_match and similarity dropped on almost every item.
const summary = page.getByText("SUMMARY").first();
const sb = await summary.boundingBox();
await glideTo(sb.x + 900, sb.y + 60, 1000);
await page.waitForTimeout(1600);

await glideClick(search, 900, { x: 0.3, y: 0.5 });
await page.keyboard.type(FILTER, { delay: 60 });
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await scene.cut(async () => {
  await page.waitForTimeout(900);
  await skeletonsGone(page, 60_000);
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
});
await page.waitForTimeout(1800);

// Annotate the first remaining item without leaving the comparison.
await glideClick(page.getByRole("button", { name: "Annotate" }).first(), 900);
const addScore = page.getByRole("button", { name: "Add score" });
await scene.cut(async () => {
  await addScore.waitFor({ timeout: 30_000 });
  await skeletonsGone(page);
});
await page.waitForTimeout(800);
await glideClick(addScore, 700, { x: 0.12, y: 0.5 });
await glideClick(page.getByText("Accuracy (Categorical)"), 600, {
  x: 0.08,
  y: 0.5,
});
await page.waitForTimeout(600);
await glideClick(page.getByText("Select category").first(), 700, {
  x: 0.15,
  y: 0.5,
});
await page.waitForTimeout(450);
await glideClick(
  page.getByRole("option", { name: "Partially correct", exact: true }),
  600,
  { x: 0.06, y: 0.5 },
);
await page.waitForTimeout(2200);

await glideTo(1180, 845, 800);
await scene.cut(async () => {
  seed("docs-demo-datasets", ["--project", "docs-demo"]);
  await page.goto(compareUrl);
  await compareLoaded();
  await clearSearch();
  await page.goto(compareUrl);
  await compareLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
