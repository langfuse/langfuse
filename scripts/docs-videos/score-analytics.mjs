// Docs: /docs landing page, Evaluation > Analytics tab.
// Scores > Analytics: the distribution and trend of one score, then a second
// score for the comparison view.
import { openScene, seed } from "./lib.mjs";
import { smoothScroll } from "./scroll-helpers.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const analyticsUrl = "http://localhost:3000/project/docs-demo/scores/analytics";

const scene = await openScene("score-analytics");
const { page, glideTo, glideClick, wide } = scene;

const first = page
  .getByRole("combobox")
  .filter({ hasText: /First score|helpfulness/ });
const second = page
  .getByRole("combobox")
  .filter({ hasText: /Second score|faithfulness/ });
const emptyLoaded = async () => {
  await page.getByText("Select a Score").waitFor({ timeout: 60_000 });
};
// The comparison heatmap keeps pulsing placeholders until a second score is
// picked, so wait for the charts' content instead of for skeletons to go.
const chartsLoaded = async (second) => {
  await page.getByText("Trend Over Time").waitFor({ timeout: 60_000 });
  if (second) {
    await page.waitForFunction(
      () => !document.body.innerText.includes("Select a second score"),
      null,
      { timeout: 60_000 },
    );
  }
  await page.waitForTimeout(1500);
};
const pick = async (combobox, name, pattern, isSecond) => {
  await glideClick(combobox, 800, { x: 0.3, y: 0.5 });
  const option = page.getByRole("option").filter({ hasText: pattern }).first();
  // The picker can swallow a click while the charts re-render; reopen it.
  try {
    await option.waitFor({ timeout: 10_000 });
  } catch {
    await page.keyboard.press("Escape");
    await combobox.click();
    await option.waitFor();
  }
  // Narrow the list first: longer lists put the score below the fold.
  await page.waitForTimeout(400);
  await page.keyboard.type(name, { delay: 60 });
  await page.waitForTimeout(500);
  await glideClick(option, 600, { x: 0.2, y: 0.5 });
  await scene.cut(() => chartsLoaded(isSecond));
};

// Compile the charts once.
await page.goto(analyticsUrl);
await emptyLoaded();
// The picker can ignore a pick while its score list is still loading.
for (let attempt = 0; ; attempt++) {
  await first.click();
  await page
    .getByRole("option")
    .filter({ hasText: /^helpfulness/ })
    .first()
    .click();
  try {
    await page.getByText("Trend Over Time").waitFor({ timeout: 15_000 });
    break;
  } catch (error) {
    if (attempt === 2) throw error;
    await page.keyboard.press("Escape");
  }
}
await page.goto(analyticsUrl);
await emptyLoaded();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(1000);
wide();
await pick(first, "helpfulness", /^helpfulness/, false);
await glideTo(1000, 520, 800);
await page.waitForTimeout(1600);
await smoothScroll(page, 500, { x: 1000, y: 520 }, 1800);
await smoothScroll(page, -500, { x: 1000, y: 520 }, 900);

await pick(second, "faithfulness", /^faithfulness/, true);
await glideTo(1000, 520, 800);
await page.waitForTimeout(1600);
await smoothScroll(page, 560, { x: 1000, y: 520 }, 2000);

await glideTo(1000, 600, 700);
await scene.cut(async () => {
  await page.goto(analyticsUrl);
  await emptyLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
