// Docs: /docs/evaluation/experiments/experiments-via-ui ("Compare runs").
// Selects three capital-cities experiments, compares them side by side, and
// opens one item's trace with its generation selected.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-datasets", ["--project", "docs-demo"]);
const scene = await openScene("datasets-compare");
const { page, glideTo, glideClick, wide } = scene;

await page.goto(links[1]);
// Comparison view: show each run's output, hide the expected-output column
// so three runs fit, and collapse the filter sidebar.
await page.evaluate(() => {
  localStorage.setItem(
    "experimentItemsColumnVisibility-compare-v2-docs-demo",
    JSON.stringify({
      input: true,
      output: true,
      expectedOutput: false,
      totalCost: false,
      latencyMs: false,
      startTime: false,
      level: false,
      experimentId: true,
    }),
  );
  localStorage.setItem("data-table-controls-experiment-items", "false");
});
const row = (name) =>
  page.getByRole("row").filter({ hasText: name }).getByRole("checkbox");
const runs = ["asking-specifically", "directly-ask", "famous-city"];
const compare = page.getByRole("button", { name: "Compare" });
const outputCell = page.getByText('"The capital of Australia is Canberra."');
const generation = page
  .getByRole("dialog")
  .getByText("answer-question", { exact: true })
  .first();
const generationInput = page.locator("p:visible", {
  hasText: "What is the capital of Australia?",
});
const close = page.getByRole("dialog").getByLabel("Close", { exact: true });
const backToDataset = async () => {
  for (let i = 0; i < 4 && !page.url().includes("/datasets/"); i++) {
    await page.goBack();
  }
  await row("famous-city").waitFor();
  await page.getByText("$0.002").first().waitFor({ timeout: 60_000 });
  // The cost chart shows a spinner until its query returns.
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '[class*="animate-spin"], [class*="animate-pulse"], svg[class*="loader"]',
      ),
    undefined,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1500);
};

// Rehearse the whole flow off camera with client-side navigation only, so
// the take replays it from the app's query cache instead of a slow dev
// server.
await page.reload();
await row("famous-city").waitFor({ timeout: 60_000 });
for (const name of runs) await row(name).click();
await compare.click();
await outputCell.waitFor({ timeout: 60_000 });
await outputCell.click();
await generation.click({ timeout: 60_000 });
await generationInput.waitFor({ timeout: 60_000 });
await close.click();
await backToDataset();
await page.waitForTimeout(1500);
const rest = { x: 1100, y: 800 };
await scene.placeCursor(rest.x, rest.y);

// Table area right of the filter sidebar, so no clipped filter labels show.
const table = { x: 300, y: 270, width: 960, height: 540 };

await scene.record();
await page.waitForTimeout(1000);
const first = await row("asking-specifically").boundingBox();
await glideTo(first.x + 60, first.y + 70, 900);
for (const name of runs) {
  await glideClick(row(name), 420);
  await page.waitForTimeout(250);
}
await compare.waitFor();
await page.waitForTimeout(300);
await glideClick(compare, 700, { x: 0.15, y: 0.5 });

await scene.cut(async () => {
  await page.waitForURL(/experiments\/results/, { timeout: 60_000 });
  await page.getByText("SUMMARY").first().waitFor({ timeout: 60_000 });
  await outputCell.waitFor();
});
await page.waitForTimeout(300);
wide();
await glideTo(1000, 620, 900);
await page.waitForTimeout(1000);

await glideClick(outputCell, 600, { x: 0.92, y: 0.5 });
await scene.cut(() => generation.waitFor({ timeout: 30_000 }));
await page.waitForTimeout(600);
// Click the type icon left of the label so the cursor leaves the name readable.
await glideClick(generation, 700, { x: -0.12, y: 0.5 });
await scene.cut(() => generationInput.waitFor({ timeout: 60_000 }));
await page.waitForTimeout(1800);

await glideClick(close, 800);
await page.getByRole("dialog").waitFor({ state: "hidden" });
await page.waitForTimeout(700);
// Back to the dataset: the take ends on the experiments table it began on.
await scene.cut(backToDataset);
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(800);
await glideTo(rest.x, rest.y, 800);
await page.waitForTimeout(1000);
await scene.finish();
