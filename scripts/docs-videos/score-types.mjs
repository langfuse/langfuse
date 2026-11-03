// Docs: /docs/evaluation/scores/overview.
// Annotates a support reply with a boolean score (Cites Help Article:
// False) and a free-text score (Reviewer Notes), then shows both on the
// observation's Scores tab.
// docs-demo-evals resets the annotation scores on these traces.
import { openScene, seed } from "./lib.mjs";
import { clearSidebarFilters } from "./sidebar-helpers.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

const { links } = seed("docs-demo-evals", ["--project", "docs-demo"]);
const traceUrl = links[0];
const tracingUrl = "http://localhost:3000/project/docs-demo/observations";
const NOTE = "Link the Download invoices article it was given.";

const scene = await openScene("score-types");
const { page, glideTo, glideClick, wide } = scene;

const annotate = page.getByRole("button", { name: "Annotate", exact: true });
const traceLoaded = async () => {
  await page.getByText("generate-answer").first().waitFor({ timeout: 60_000 });
  await page.getByText("generate-answer").first().click();
  await annotate.waitFor();
  await skeletonsGone(page);
  await page.waitForTimeout(800);
};
const tableLoaded = async () => {
  await page.getByText("Start Time").first().waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
};

await page.goto(tracingUrl);
await tableLoaded();
await clearSidebarFilters(page);
await page.goto(traceUrl);
await traceLoaded();
await scene.placeCursor(1120, 620);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(annotate, 900, { x: 0.12, y: 0.5 });
const addScore = page.getByRole("button", { name: "Add score" });
await addScore.waitFor();
await page.waitForTimeout(700);

await glideClick(addScore, 700, { x: 0.12, y: 0.5 });
await glideClick(page.getByText("Cites Help Article (Boolean)"), 600, {
  x: 0.08,
  y: 0.5,
});
await page.waitForTimeout(700);
await glideClick(page.getByText("False", { exact: true }).last(), 700);
await page.waitForTimeout(900);

await glideClick(addScore, 700, { x: 0.12, y: 0.5 });
await glideClick(page.getByText("Reviewer Notes (Text)"), 600, {
  x: 0.08,
  y: 0.5,
});
await page.waitForTimeout(600);
const note = page.getByRole("textbox").last();
await glideClick(note, 700, { x: 0.2, y: 0.5 });
await page.keyboard.type(NOTE, { delay: 40 });
await page.keyboard.press("Tab");
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1240, 560, 700);
await page.waitForTimeout(1800);

// Both scores on the observation's Scores tab.
await glideClick(page.getByRole("tab", { name: "Scores" }).first(), 900);
await scene.cut(async () => {
  await page.getByText("Cites Help Article").last().waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(2600);

await glideTo(1120, 620, 800);
await scene.cut(async () => {
  seed("docs-demo-evals", ["--project", "docs-demo"]);
  await page.goto(tracingUrl);
  await tableLoaded();
  await clearSidebarFilters(page);
  await page.goto(traceUrl);
  await traceLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
