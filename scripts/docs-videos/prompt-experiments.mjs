// Docs: /docs/evaluation/experiments/experiments-via-ui (intro video).
// Starts a prompt experiment on capital-cities with answer-question v3 and
// gpt-4.1. The experiments table already holds a finished prompt experiment
// (answer-question v2) from the seed; executing the new run needs the
// worker, so the take ends on the "Experiment triggered" toast.
import { openScene, seed } from "./lib.mjs";

// Re-seeding deletes runs that earlier takes created.
const { links } = seed("docs-demo-datasets", ["--project", "docs-demo"]);
const scene = await openScene("prompt-experiments");
const { page, glideTo, glideClick, wide } = scene;

const runExperiment = page.getByRole("button", {
  name: "Run experiment",
  exact: true,
});
const configure = page.getByRole("button", { name: "Configure" }).first();
const promptSelect = page.getByText("Select a prompt");
const promptOption = page.locator('[cmdk-item][data-value="answer-question"]');
const stepTitle = page.getByText("Prompt & Model Configuration");
const next = page.getByRole("button", { name: /^Next/ });
const valid = page.getByText("Valid configuration");
const submit = page.getByRole("button", {
  name: "Run Experiment",
  exact: true,
});

// Rehearse the wizard off camera so the take reads from the query cache.
await page.goto(links[1]);
await page.getByText("famous-city").first().waitFor({ timeout: 60_000 });
await runExperiment.click();
await configure.click();
await promptSelect.click({ timeout: 60_000 });
await promptOption.click();
await stepTitle.click();
for (let i = 0; i < 4; i++) {
  await next.click();
  await page.waitForTimeout(800);
}
await submit.waitFor();
await page.keyboard.press("Escape");
await submit.waitFor({ state: "hidden" });
await page.getByText("$0.002").first().waitFor({ timeout: 60_000 });
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1500);
const rest = { x: 1100, y: 800 };
await scene.placeCursor(rest.x, rest.y);

const runBox = await runExperiment.boundingBox();
const headerActions = { x: 980, y: 0, width: 556, height: 312 };
// The wizard is ~770x780 CSS px; 1.12x keeps it whole, title to footer.
const wizard = { x: 82, y: 46, width: 1372, height: 772 };

await scene.record();
await page.waitForTimeout(1000);
await glideTo(runBox.x - 60, runBox.y + 110, 900);
await glideClick(runExperiment, 450, { x: 0.2, y: 0.5 });
await scene.cut(async () => {
  await configure.waitFor();
  // The webhook card loads its own config; let it settle before moving on.
  await page.getByText("Loading...").waitFor({ state: "hidden" });
  await page.waitForTimeout(300);
});
const configureBox = await configure.boundingBox();
await glideTo(
  configureBox.x + configureBox.width / 2,
  configureBox.y + configureBox.height / 2,
  900,
);
await glideClick(configure, 200);

await scene.cut(() => promptSelect.waitFor());
await page.waitForTimeout(500);
await glideClick(promptSelect, 650, { x: 0.3, y: 0.5 });
await scene.cut(() => promptOption.waitFor());
await page.waitForTimeout(400);
await glideClick(promptOption, 600, { x: 0.6, y: 0.5 });
await scene.cut(() => page.getByText("Version 3").waitFor());
await page.waitForTimeout(300);
// The combobox list stays open after picking; click the step title to close.
await glideClick(stepTitle, 550, { x: 0.9, y: 0.5 });
await page.waitForTimeout(900);

await glideClick(next, 700, { x: 0.35, y: 0.5 });
await scene.cut(() => valid.waitFor());
await page.waitForTimeout(1400);
for (const step of ["Evaluators (Optional)", "Experiment Run Details"]) {
  await glideClick(next, 300, { x: 0.35, y: 0.5 });
  await scene.cut(() => page.getByText(step).first().waitFor());
  await page.waitForTimeout(550);
}
await glideClick(next, 300, { x: 0.35, y: 0.5 });
await scene.cut(() => submit.waitFor());
await page.waitForTimeout(1200);
await glideClick(submit, 500, { x: 0.2, y: 0.5 });

const toast = page.getByText("Experiment triggered successfully");
await scene.cut(() => toast.waitFor({ timeout: 60_000 }));
await page.waitForTimeout(300);
const toastBox = await toast.boundingBox();
await glideTo(toastBox.x + 60, toastBox.y + 130, 800);
await page.waitForTimeout(1500);
await glideClick(
  page.locator("[data-sonner-toast]").getByRole("button", { name: "Close" }),
  600,
);
await toast.waitFor({ state: "hidden" });
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(300);
await glideTo(rest.x, rest.y, 1000);
wide();
await page.waitForTimeout(1500);
await scene.finish();
