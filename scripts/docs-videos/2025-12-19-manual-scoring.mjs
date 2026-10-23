// Docs: /docs/evaluation/evaluation-methods/scores-via-ui ("Manual Scores via
// UI"). Annotates a support-chat generation with two score configs from the
// Annotate panel: Accuracy (categorical) and Helpfulness (numeric 1-5).
import { openScene, seed } from "./lib.mjs";

// Resets the annotation scores on these traces so every take starts unscored.
const { links } = seed("docs-demo-evals", ["--project", "docs-demo"]);
const scene = await openScene("2025-12-19-manual-scoring");
const { page, glideTo, glideClick, wide } = scene;

await page.goto(links[0]);
await page.getByText("generate-answer").first().click();
const annotate = page.getByRole("button", { name: "Annotate", exact: true });
await annotate.waitFor();
await page.waitForTimeout(2500);
await scene.placeCursor(1120, 620);
await page.waitForTimeout(400);

const panelArea = { x: 900, y: 40, width: 636, height: 520 };
const onIcon = { x: 0.12, y: 0.5 };

await scene.record();
await page.waitForTimeout(1000);
wide();
const annotateBox = await annotate.boundingBox();
await glideTo(annotateBox.x - 60, annotateBox.y + 70, 900);
await glideClick(annotate, 420, onIcon);

const addScore = page.getByRole("button", { name: "Add score" });
await addScore.waitFor();
await page.waitForTimeout(700);
await glideClick(addScore, 600, onIcon);
await glideClick(page.getByText("Accuracy (Categorical)"), 500, {
  x: 0.08,
  y: 0.5,
});
await page.waitForTimeout(500);
await glideClick(addScore, 550, onIcon);
await glideClick(page.getByText("Helpfulness (Numeric)"), 500, {
  x: 0.08,
  y: 0.5,
});
await page.waitForTimeout(500);

await glideClick(page.getByText("Select category").first(), 600, {
  x: 0.15,
  y: 0.5,
});
await page.waitForTimeout(450);
await glideClick(
  page.getByRole("option", { name: "Correct", exact: true }),
  500,
  { x: 0.04, y: 0.5 },
);
await page.waitForTimeout(700);

const helpfulness = page.getByRole("spinbutton").first();
await glideClick(helpfulness, 600, { x: 0.1, y: 0.5 });
await page.keyboard.type("4", { delay: 60 });
await page.keyboard.press("Tab");
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1240, 520, 600);
await page.waitForTimeout(1600);

// Close the panel so the take ends on the trace view it started from.
const addBox = await addScore.boundingBox();
const closeX = addBox.x + addBox.width + 24;
const closeY = addBox.y + addBox.height / 2;
await glideTo(closeX, closeY, 650);
await page.waitForTimeout(140);
await page.mouse.down();
await page.waitForTimeout(90);
await page.mouse.up();
await page.waitForTimeout(150);
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1120, 620, 1000);
wide();
await page.waitForTimeout(1000);
await scene.finish();
