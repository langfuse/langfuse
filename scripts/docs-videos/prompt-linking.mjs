// Docs: /docs/prompt-management/features/link-to-traces.
// From a generation that used movie-critic v3, follow its prompt badge to the
// prompt, open Linked Generations, then the per-version Metrics table.
import { openScene } from "./lib.mjs";
import {
  seedPromptUsage,
  showOnlyScoreColumns,
  skeletonsGone,
  withCuts,
} from "./prompt-usage-helpers.mjs";

const { links } = seedPromptUsage();
const scene = withCuts(await openScene("prompt-linking"));
const { page, glideTo, focus, wide, hidden, clickHidden } = scene;

const promptBadge = () =>
  page.getByRole("link", { name: /movie-critic - v3/ }).first();
await page.goto(links[0]);
await page.getByText("critic-answer").first().click();
await promptBadge().waitFor();
await page.waitForTimeout(1000);
// Reload on the URL that carries the selection, so going back restores it.
await page.goto(page.url());
await promptBadge().waitFor();
const startHistory = await page.evaluate(() => history.length);

/** Returns to the trace in one history jump (tab switches push entries). */
async function backToTrace() {
  const steps = (await page.evaluate(() => history.length)) - startHistory;
  if (steps > 0) await page.evaluate((n) => history.go(-n), steps);
  await page.waitForURL((url) => url.pathname.includes("/traces/"));
  await promptBadge().waitFor();
  await page.getByText("Mostly yes").first().waitFor();
  await skeletonsGone(page);
}

const linkedTab = page.getByRole("tab", { name: "Linked Generations" });
const metricsTab = page.getByText("Metrics", { exact: true }).first();
const firstLinkedRow = page
  .getByRole("cell", { name: "critic-answer" })
  .first();
/** Every version row has its medians and score averages. */
const metricsLoaded = async () => {
  await page
    .getByRole("cell", { name: /^Ø/ })
    .nth(5)
    .waitFor({ timeout: 90_000 });
  await page
    .getByRole("cell", { name: /^\$0\.0/ })
    .nth(2)
    .waitFor();
  await skeletonsGone(page);
};

// Warm-up pass off camera so the dev server has compiled every route.
await promptBadge().click();
await linkedTab.click();
await firstLinkedRow.waitFor({ timeout: 90_000 });
await metricsTab.click();
await page.getByText("Median latency").first().waitFor({ timeout: 90_000 });
// Score columns are project-wide; show only this prompt's evaluators.
await showOnlyScoreColumns(page, [
  "Trace-hallucination-EVAL-NUMERIC",
  "Trace-toxicity-EVAL-NUMERIC",
]);
await metricsLoaded();
await backToTrace();
await page.waitForTimeout(1000);
await scene.placeCursor(1100, 620);
const badgeBox = await promptBadge().boundingBox();

await scene.record();
await page.waitForTimeout(1000);
await glideTo(badgeBox.x + badgeBox.width / 2 - 40, badgeBox.y + 70, 900);
focus({ x: badgeBox.x - 600, y: 0, width: 860, height: 400 }, 1.8);
await clickHidden(promptBadge(), 450, { x: 0.25, y: 0.5 }, async () => {
  await linkedTab.waitFor();
  await page.getByText("Text Prompt").first().waitFor();
  await skeletonsGone(page);
});

// Prompt page, production version selected.
await page.waitForTimeout(300);
wide();
await page.waitForTimeout(500);
await clickHidden(linkedTab, 800, undefined, async () => {
  await firstLinkedRow.waitFor({ timeout: 90_000 });
  await page
    .getByRole("cell", { name: /As a .* movie critic/ })
    .nth(9)
    .waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(300);
await glideTo(1000, 520, 800);
focus({ x: 430, y: 150, width: 1024, height: 576 }, 1.5);
await page.waitForTimeout(1600);

const metricsBox = await metricsTab.boundingBox();
await glideTo(metricsBox.x + 60, metricsBox.y + 60, 700);
wide();
await clickHidden(metricsTab, 350, undefined, metricsLoaded);
await page.waitForTimeout(300);

// Read the table: medians per version, then the evaluator averages.
focus({ x: 40, y: 40, width: 900, height: 506 }, 1.7);
const rows = page.getByRole("row");
for (const index of [1, 2, 3]) {
  const box = await rows.nth(index).boundingBox();
  await glideTo(box.x + 560, box.y + box.height / 2 + 14, 600);
  await page.waitForTimeout(350);
}
const scoreHeader = await page
  .getByRole("columnheader", { name: /hallucination/i })
  .boundingBox();
const lastRow = await rows.nth(3).boundingBox();
await glideTo(scoreHeader.x + 60, lastRow.y + lastRow.height / 2 + 14, 900);
focus({ x: scoreHeader.x - 330, y: 40, width: 900, height: 506 }, 1.7);
for (const index of [2, 1]) {
  const box = await rows.nth(index).boundingBox();
  await glideTo(scoreHeader.x + 60, box.y + box.height / 2 + 14, 550);
  await page.waitForTimeout(350);
}
await page.waitForTimeout(500);

// Back to the generation for a seamless loop.
await glideTo(1100, 620, 900);
wide();
await hidden(backToTrace);
await page.waitForTimeout(1000);
await scene.finish();
