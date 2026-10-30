// Docs: /docs/prompt-management/features/playground ("Open a generation in
// the playground"). From a qa-answer generation in a trace, Add to ->
// Playground -> Fresh playground loads its messages, then reruns them.
import { openScene } from "./lib.mjs";
import {
  seedPromptUsage,
  skeletonsGone,
  withCuts,
} from "./prompt-usage-helpers.mjs";

const { links } = seedPromptUsage();
const traceUrl = links.at(-1);
const scene = withCuts(await openScene("playground-open-generation"));
const { page, glideTo, glideClick, focus, wide, hidden, clickHidden } = scene;

const generationRow = page.getByText("answer-with-context").first();
const addTo = page.getByRole("button", { name: "Add to" });
const submit = page.getByRole("button", { name: "Submit" });
const traceLoaded = async () => {
  await addTo.waitFor({ timeout: 90_000 });
  await page
    .getByText("Help-center context")
    .first()
    .waitFor({ timeout: 90_000 });
  await skeletonsGone(page, 800);
};
const playgroundLoaded = async () => {
  await submit.waitFor({ timeout: 90_000 });
  await page
    .locator(".cm-content")
    .filter({ hasText: "Customer question" })
    .first()
    .waitFor({ timeout: 90_000 });
  await skeletonsGone(page, 800);
};
const openMenu = async () => {
  await addTo.click();
  await page.getByRole("menuitem", { name: /Playground/ }).click();
};

// Select the generation, reload on its URL so going back restores it.
await page.goto(traceUrl);
await generationRow.waitFor({ timeout: 90_000 });
await generationRow.click();
await traceLoaded();
await page.goto(page.url());
await traceLoaded();
const startHistory = await page.evaluate(() => history.length);
const backToTrace = async () => {
  const steps = (await page.evaluate(() => history.length)) - startHistory;
  if (steps > 0) await page.evaluate((n) => history.go(-n), steps);
  await page.waitForURL((url) => url.pathname.includes("/traces/"));
  await traceLoaded();
};

// Warm-up pass so the playground route is compiled.
await openMenu();
await page.getByRole("menuitem", { name: "Fresh playground" }).click();
await playgroundLoaded();
await backToTrace();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1000);
const addToBox = await addTo.boundingBox();
await glideTo(addToBox.x - 30, addToBox.y + 90, 900);
focus({ x: 636, y: 40, width: 900, height: 506 }, 1.7);
await glideClick(addTo, 400, { x: 0.2, y: 0.5 });
const playgroundItem = page.getByRole("menuitem", { name: /Playground/ });
await playgroundItem.waitFor();
await page.waitForTimeout(500);
await glideClick(playgroundItem, 450, { x: 0.12, y: 0.5 });
const fresh = page.getByRole("menuitem", { name: "Fresh playground" });
await fresh.waitFor();
await page.waitForTimeout(600);
await clickHidden(fresh, 450, { x: 0.1, y: 0.5 }, playgroundLoaded);

// The playground holds the generation's system and user messages.
await page.waitForTimeout(400);
wide();
await page.waitForTimeout(1600);
const submitBox = await submit.boundingBox();
await glideTo(submitBox.x + submitBox.width * 0.45, submitBox.y - 60, 900);
// Show the model at work: the spinner and the answer streaming in. Only a
// wait past a few seconds is cut, so a slow gateway cannot stall the take.
await glideClick(submit, 350, { x: 0.47, y: 0.5 });
let answered = false;
const answer = submit
  .and(page.locator(":enabled"))
  .waitFor({ timeout: 90_000 })
  .then(() => (answered = true));
await page.waitForTimeout(800);
await Promise.race([answer, page.waitForTimeout(3500)]);
if (!answered) await scene.cut(() => answer);
await page.waitForTimeout(300);
const outputBox = await page.getByText("Output", { exact: true }).boundingBox();
await glideTo(outputBox.x + 700, outputBox.y - 60, 800);
await page.waitForTimeout(2200);

// Back to the generation for a seamless loop.
await glideTo(1000, 640, 900);
await hidden(backToTrace);
await page.waitForTimeout(1000);
await scene.finish();
