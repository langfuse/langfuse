// Docs: /docs/prompt-management/features/playground ("Save your prompt to
// Prompt Management"). Saves a playground chat prompt as the new prompt
// movie-critic-chat, which lands on its first version with production.
import { openScene } from "./lib.mjs";
import { skeletonsGone, withCuts } from "./prompt-usage-helpers.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PROMPT_NAME = "movie-critic-chat";
const SYSTEM =
  "As a {{criticlevel}} movie critic, do you like {{movie}}? Please answer in one sentence.";

// The take creates the prompt; delete it first so every take starts clean.
const auth = Buffer.from("pk-lf-docs-demo:sk-lf-docs-demo").toString("base64");
const reset = await fetch(`${BASE}/api/public/v2/prompts/${PROMPT_NAME}`, {
  method: "DELETE",
  headers: { Authorization: `Basic ${auth}` },
});
if (![200, 204, 404].includes(reset.status)) {
  throw new Error(`Could not reset ${PROMPT_NAME}: HTTP ${reset.status}`);
}

const scene = withCuts(await openScene("playground-save-prompt"));
const { page, glideTo, glideClick, focus, wide, hidden, clickHidden } = scene;

// Playground state lives in sessionStorage, so every take starts fresh.
await page.goto(`${BASE}/project/docs-demo/playground`);
await page.getByRole("button", { name: "Submit" }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1000);
await page.locator(".cm-content").first().click();
await page.keyboard.type(SYSTEM);
await page.getByRole("button", { name: "Delete message" }).nth(1).click();
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(800);
const startHistory = await page.evaluate(() => history.length);

const saveButton = page.getByRole("button", { name: "Save as prompt" });
const saveNew = page.getByText("Save as new prompt", { exact: true });
const nameInput = page.getByPlaceholder("Name your prompt");
const createButton = page.getByRole("button", { name: "Create prompt" });
const header = { x: 636, y: 40, width: 900, height: 506 };

// Warm-up pass so the new-prompt route is compiled.
await saveButton.click();
await saveNew.click();
await nameInput.waitFor({ timeout: 90_000 });
await skeletonsGone(page, 800);
await page.evaluate(
  (n) => history.go(-n),
  (await page.evaluate(() => history.length)) - startHistory,
);
await saveButton.waitFor({ timeout: 90_000 });
await page
  .locator(".cm-content")
  .filter({ hasText: "movie critic" })
  .first()
  .waitFor();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(1000);
// The save button is small: arrive on it, rest a beat so viewers see where
// it is, then click; the popover stays up long enough to read.
const saveBox = await saveButton.boundingBox();
await glideTo(
  saveBox.x + saveBox.width * 0.15,
  saveBox.y + saveBox.height / 2,
  1200,
);
focus(header, 1.7);
await page.waitForTimeout(500);
await glideClick(saveButton, 120, { x: 0.15, y: 0.5 });
await saveNew.waitFor();
await page.waitForTimeout(1300);
await glideClick(saveNew, 700, { x: 0.12, y: 0.5 });
await page.waitForTimeout(450);
await hidden(async () => {
  await nameInput.waitFor({ timeout: 90_000 });
  await skeletonsGone(page, 800);
});

// The new-prompt form opens with the playground's chat messages.
await page.waitForTimeout(400);
wide();
await page.waitForTimeout(900);
const nameBox = await nameInput.boundingBox();
await glideTo(nameBox.x + 260, nameBox.y + 60, 800);
focus({ x: 0, y: 60, width: 1000, height: 562 }, 1.55);
await glideClick(nameInput, 400, { x: 0.12, y: 0.5 });
await page.keyboard.type(PROMPT_NAME, { delay: 55 });
await page.waitForTimeout(600);

// Scroll to the submit button; the production label stays checked.
await glideTo(900, 620, 600);
wide();
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(70);
}
await page.waitForTimeout(700);
const createBox = await createButton.boundingBox();
await glideTo(createBox.x + createBox.width / 2, createBox.y - 50, 800);
await clickHidden(createButton, 400, { x: 0.5, y: 0.5 }, async () => {
  await page.waitForURL(
    (url) => url.pathname.endsWith(`/prompts/${PROMPT_NAME}`),
    {
      timeout: 90_000,
    },
  );
  await page
    .getByText("Linked Generations")
    .first()
    .waitFor({ timeout: 90_000 });
  await skeletonsGone(page, 800);
});

// The prompt's first version, labeled production and latest.
await page.waitForTimeout(300);
wide();
await page.waitForTimeout(600);
await glideTo(520, 420, 800);
focus({ x: 0, y: 30, width: 1180, height: 664 }, 1.3);
await page.waitForTimeout(2000);

// Back to the playground for a seamless loop.
await glideTo(1000, 600, 900);
wide();
await hidden(async () => {
  const steps = (await page.evaluate(() => history.length)) - startHistory;
  await page.evaluate((n) => history.go(-n), steps);
  await saveButton.waitFor({ timeout: 90_000 });
  await page
    .locator(".cm-content")
    .filter({ hasText: "movie critic" })
    .first()
    .waitFor();
  await page.waitForTimeout(500);
});
await page.waitForTimeout(1000);
await scene.finish();
