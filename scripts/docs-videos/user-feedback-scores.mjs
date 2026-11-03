// Docs: /docs landing page, Evaluation > User Feedback tab.
// Thumbs up/down that the support chat sends through the API, as scores
// with the customer's comment: filtered to the thumbs-down ones, then the
// conversation one of them belongs to.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const scoresUrl = "http://localhost:3000/project/docs-demo/scores";

const scene = await openScene("user-feedback-scores");
const { page, glideTo, glideClick, wide } = scene;

const search = page.getByRole("combobox", { name: "Search" }).first();
const tableLoaded = async () => {
  await search.waitFor({ timeout: 60_000 });
  await page.getByText("Timestamp").first().waitFor();
  await skeletonsGone(page, 60_000);
};
const feedbackLoaded = async () => {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("tbody tr")].length > 3 &&
      [...document.querySelectorAll("tbody tr")]
        .slice(0, 8)
        .every(
          (tr) =>
            tr.innerText.includes("user-feedback") &&
            tr.innerText.includes("0.00"),
        ),
    null,
    { timeout: 60_000 },
  );
  await skeletonsGone(page, 60_000);
};

await page.goto(scoresUrl);
await tableLoaded();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 620);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(search, 900, { x: 0.3, y: 0.5 });
await page.keyboard.type("name:user-feedback value:<0.5", { delay: 55 });
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await scene.cut(feedbackLoaded);
// Close the suggestions so the table is in full view.
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(300);
await page.waitForTimeout(1200);

// A thumbs down with the customer's comment.
const comment = page
  .locator("tbody tr")
  .filter({
    hasText: /Still charged|Didn't answer|Link in the answer|Too generic/,
  })
  .first();
await comment.waitFor();
const commentCell = comment.locator("td").nth(3);
await glideTo(
  ...(await commentCell
    .boundingBox()
    .then((b) => [b.x + 40, b.y + b.height / 2])),
  900,
);
await page.waitForTimeout(1600);

// Open the conversation it belongs to.
const traceLink = comment.locator("a").first();
await glideClick(traceLink, 800, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  // The trace opens in a side panel.
  await page
    .getByRole("tab", { name: "Tree" })
    .first()
    .waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
  await page.waitForTimeout(500);
});
await page.waitForTimeout(2400);

await glideTo(1000, 620, 800);
await scene.cut(async () => {
  await page.goto(scoresUrl);
  await tableLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
