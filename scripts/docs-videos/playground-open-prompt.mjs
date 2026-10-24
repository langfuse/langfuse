// Docs: /docs/prompt-management/features/playground ("Open your prompt in
// the playground"). Opens movie-critic v3 in a fresh playground, fills its
// two variables and runs it against the project's LLM connection.
import { openScene } from "./lib.mjs";
import {
  seedPromptUsage,
  skeletonsGone,
  withCuts,
} from "./prompt-usage-helpers.mjs";

const { links } = seedPromptUsage();
const promptUrl = links.find((link) => link.endsWith("/prompts/movie-critic"));
const scene = withCuts(await openScene("playground-open-prompt"));
const { page, glideTo, glideClick, focus, wide, hidden, clickHidden } = scene;

const playgroundMenu = page.getByRole("button", { name: /Playground/ }).first();
const promptLoaded = async () => {
  await page.getByText("Text Prompt").first().waitFor({ timeout: 90_000 });
  await skeletonsGone(page);
};
const submit = page.getByRole("button", { name: "Submit" });
const playgroundLoaded = async () => {
  await submit.waitFor({ timeout: 90_000 });
  await page
    .locator(".cm-content")
    .filter({ hasText: "movie critic" })
    .first()
    .waitFor({ timeout: 90_000 });
  await skeletonsGone(page, 800);
};

// Warm-up pass so the playground route is compiled.
await page.goto(promptUrl);
await promptLoaded();
await playgroundMenu.click();
await page.getByRole("menuitem", { name: "Fresh playground" }).click();
await playgroundLoaded();
await page.goto(promptUrl);
await promptLoaded();
const startHistory = await page.evaluate(() => history.length);
await scene.placeCursor(1000, 600);
await page.waitForTimeout(500);

const header = { x: 636, y: 40, width: 900, height: 506 };

await scene.record();
await page.waitForTimeout(1000);
const menuBox = await playgroundMenu.boundingBox();
await glideTo(menuBox.x - 50, menuBox.y + 90, 900);
focus(header, 1.7);
await glideClick(playgroundMenu, 400, { x: 0.2, y: 0.5 });
const fresh = page.getByRole("menuitem", { name: "Fresh playground" });
await fresh.waitFor();
await page.waitForTimeout(500);
await clickHidden(fresh, 450, { x: 0.1, y: 0.5 }, playgroundLoaded);
await page.waitForTimeout(600);
wide();
await page.waitForTimeout(300);

// Fill the prompt's variables.
const variables = page.getByRole("button", { name: /Variables/ }).first();
const varsBox = await variables.boundingBox();
await glideTo(varsBox.x + 40, varsBox.y + 70, 800);
focus({ x: 0, y: 40, width: 900, height: 506 }, 1.7);
await glideClick(variables, 350, { x: 0.2, y: 0.5 });
const editors = page.locator("[role=dialog] .cm-content");
await editors.nth(1).waitFor();
await page.waitForTimeout(400);
for (const [index, value] of [
  [0, "expert"],
  [1, "Dune: Part Two"],
]) {
  await glideClick(editors.nth(index), 450, { x: 0.85, y: 0.5 });
  await page.keyboard.type(value, { delay: 45 });
  await page.waitForTimeout(250);
}
await page.waitForTimeout(500);
await page.keyboard.press("Escape");
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(300);

// Run it.
const submitBox = await submit.boundingBox();
await glideTo(submitBox.x + submitBox.width * 0.45, submitBox.y - 60, 900);
wide();
// Skip ahead to the finished answer: while running, the button shows a
// spinner instead of its "Submit" label.
await clickHidden(submit, 350, { x: 0.47, y: 0.5 }, async () => {
  await page.waitForTimeout(800);
  await submit.and(page.locator(":enabled")).waitFor({ timeout: 90_000 });
  await page.getByText(/Dune/).first().waitFor();
  await page.waitForTimeout(300);
});
// The answer spans the full width, so read it in the wide frame.
const outputBox = await page.getByText("Output", { exact: true }).boundingBox();
await glideTo(outputBox.x + 700, outputBox.y - 60, 800);
await page.waitForTimeout(2200);

// Back to the prompt for a seamless loop.
await glideTo(1000, 600, 900);
wide();
await hidden(async () => {
  const steps = (await page.evaluate(() => history.length)) - startHistory;
  await page.evaluate((n) => history.go(-n), steps);
  await promptLoaded();
});
await page.waitForTimeout(1000);
await scene.finish();
