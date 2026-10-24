// Docs: /docs/prompt-management/features/a-b-testing ("Analyze Results").
// Compares versions of qa-answer-with-context-chat on its Metrics tab:
// latency, tokens, cost, generation count and evaluator scores per version.
import { openScene } from "./lib.mjs";
import {
  seedPromptUsage,
  showOnlyScoreColumns,
  skeletonsGone,
  withCuts,
} from "./prompt-usage-helpers.mjs";

const { links } = seedPromptUsage();
const promptUrl = links.find((link) =>
  link.endsWith("/prompts/qa-answer-with-context-chat"),
);
const scene = withCuts(await openScene("prompt-metrics"));
const { page, glideTo, focus, wide, clickHidden } = scene;

const metricsTab = page.getByText("Metrics", { exact: true }).first();
const versionsTab = page.getByText("Versions", { exact: true }).first();
const metricsLoaded = async () => {
  await page
    .getByRole("cell", { name: /^Ø/ })
    .nth(11)
    .waitFor({ timeout: 90_000 });
  await skeletonsGone(page);
};
const versionsLoaded = async () => {
  await page
    .getByText("Text Prompt")
    .or(page.getByText("System"))
    .first()
    .waitFor();
  await skeletonsGone(page);
};

// Warm-up pass off camera; also limits the score columns to this prompt's
// evaluators (stored per project in localStorage).
await page.goto(`${promptUrl}/metrics`);
await page.getByText("Median latency").first().waitFor({ timeout: 90_000 });
await showOnlyScoreColumns(page, [
  "Trace-accuracy-EVAL-NUMERIC",
  "Trace-helpfulness-EVAL-NUMERIC",
]);
await metricsLoaded();
await page.goto(promptUrl);
await versionsLoaded();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1000);
const metricsBox = await metricsTab.boundingBox();
await glideTo(metricsBox.x + 90, metricsBox.y + 70, 900);
focus({ x: 0, y: 0, width: 900, height: 506 }, 1.7);
await clickHidden(metricsTab, 400, undefined, metricsLoaded);
await page.waitForTimeout(300);

// Down the versions: medians first, then the evaluator averages.
const rows = page.getByRole("row");
const rowBox = (index) => rows.nth(index).boundingBox();
focus({ x: 40, y: 120, width: 900, height: 506 }, 1.65);
for (const index of [1, 3, 4, 7]) {
  const box = await rowBox(index);
  await glideTo(box.x + 600, box.y + box.height / 2 + 14, 520);
  await page.waitForTimeout(300);
}
const scoreHeader = await page
  .getByRole("columnheader", { name: /accuracy/i })
  .boundingBox();
const row = await rowBox(7);
await glideTo(scoreHeader.x + 50, row.y + row.height / 2 + 14, 900);
focus({ x: scoreHeader.x - 300, y: 120, width: 900, height: 506 }, 1.65);
for (const index of [4, 1]) {
  const box = await rowBox(index);
  await glideTo(scoreHeader.x + 50, box.y + box.height / 2 + 14, 650);
  await page.waitForTimeout(400);
}
await page.waitForTimeout(500);

// Back to the version list for a seamless loop.
const versionsBox = await versionsTab.boundingBox();
await glideTo(versionsBox.x + 70, versionsBox.y + 70, 900);
focus({ x: 0, y: 0, width: 900, height: 506 }, 1.7);
await clickHidden(versionsTab, 350, undefined, versionsLoaded);
await page.waitForTimeout(400);
await glideTo(1000, 640, 900);
wide();
await page.waitForTimeout(1000);
await scene.finish();
