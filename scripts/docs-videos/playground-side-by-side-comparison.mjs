// Docs: /docs/prompt-management/features/playground ("Side-by-Side
// Comparison View"). Splits a playground window, changes the copy's variable
// from typescript to go, and runs both windows at once with Run All.
import { openScene } from "./lib.mjs";
import { withCuts } from "./prompt-usage-helpers.mjs";

const SYSTEM =
  "You are a staff engineer in {{language}}. You only return code in markdown, nothing else.";
const USER = "Write a recursive function that adds two numbers.";

const scene = withCuts(await openScene("playground-side-by-side-comparison"));
const { page, glideTo, glideClick, wide } = scene;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// Playground state lives in sessionStorage, so every take starts fresh.
await page.goto(`${BASE}/project/docs-demo/playground`);
const submit = page.getByRole("button", { name: "Submit" });
await submit.first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(1000);
await page.locator(".cm-content").nth(0).click();
await page.keyboard.type(SYSTEM);
await page.locator(".cm-content").nth(1).click();
await page.keyboard.type(USER);
const variablesButton = (index) =>
  page.getByRole("button", { name: /Variables/ }).nth(index);
await variablesButton(0).click();
await page.locator("[role=dialog] .cm-content").first().click();
await page.keyboard.type("typescript");
await page.keyboard.press("Escape");
// Temperature 0, so the rerun in the take answers like the first run.
await page.waitForTimeout(800);
await page.evaluate(() => {
  for (const key of Object.keys(sessionStorage)) {
    if (!key.includes("playgroundCache")) continue;
    const state = JSON.parse(sessionStorage.getItem(key));
    state.modelParams.temperature = { value: 0, enabled: true };
    sessionStorage.setItem(key, JSON.stringify(state));
  }
});
await page.reload();
await submit.first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(1000);
// A first run so the take starts from a window that already has an answer.
await submit.first().click();
await page
  .getByText(/function /)
  .first()
  .waitFor({ timeout: 60_000 });
/** No window is running: no "Executing" status and no spinner. */
const idle = () =>
  page.waitForFunction(
    () =>
      !document.body.innerText.includes("Executing") &&
      !document.querySelector("button .animate-spin"),
    null,
    { timeout: 90_000 },
  );
await idle();
await page.waitForTimeout(1500);
// Give the output more room: drag the editor/output divider up.
const divider = await page.getByRole("separator").first().boundingBox();
await page.mouse.move(divider.x + divider.width / 2, divider.y);
await page.mouse.down();
await page.mouse.move(divider.x + divider.width / 2, 430, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(500);
await page.evaluate(() => document.activeElement?.blur());
await scene.placeCursor(1000, 560);
await page.waitForTimeout(500);

const splitButton = page.getByRole("button", { name: "New split window" });
const runAll = page.getByRole("button", { name: /Run All/ });

await scene.record();
await page.waitForTimeout(1000);
const splitBox = await splitButton.boundingBox();
await glideTo(splitBox.x - 60, splitBox.y + 80, 900);
await glideClick(splitButton, 400, { x: 0.15, y: 0.5 });
await variablesButton(1).waitFor();
await page.waitForTimeout(500);

// The copy opens with a short output pane; drag its divider up to match.
const divider2 = await page.getByRole("separator").nth(1).boundingBox();
const dividerX = divider2.x + divider2.width / 2;
await glideTo(dividerX, divider2.y, 800);
await page.mouse.down();
await glideTo(dividerX, 430, 600);
await page.mouse.up();
await page.waitForTimeout(400);

// Change the second window's variable.
const vars2 = await variablesButton(1).boundingBox();
await glideTo(vars2.x + 40, vars2.y + 60, 700);
await glideClick(variablesButton(1), 350, { x: 0.2, y: 0.5 });
const editor = page.locator("[role=dialog] .cm-content").first();
await editor.waitFor();
await page.waitForTimeout(400);
await glideClick(editor, 450, { x: 0.8, y: 0.5 });
await page.keyboard.press("ControlOrMeta+a");
await page.waitForTimeout(150);
await page.keyboard.type("go", { delay: 90 });
await page.waitForTimeout(700);
await page.keyboard.press("Escape");
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(300);

// Run both windows.
const runBox = await runAll.boundingBox();
await glideTo(runBox.x + runBox.width * 0.3, runBox.y + 80, 800);
await glideClick(runAll, 350, { x: 0.15, y: 0.5 });
await page.waitForTimeout(400);
await glideTo(900, 560, 900);
wide();
// Skip the wait for the first tokens, watch both answers stream for a
// moment, then skip to the finished state.
await scene.hidden(() =>
  page.getByText(/func /).first().waitFor({ timeout: 60_000 }),
);
wide();
await page.waitForTimeout(1200);
await scene.hidden(idle);
wide();
await page.waitForTimeout(2000);

// Close the copy: the take ends on the single window it started with.
const close = page.getByRole("button", { name: "Remove window" }).last();
const closeBox = await close.boundingBox();
await glideTo(closeBox.x - 40, closeBox.y + 70, 800);
await glideClick(close, 350);
await page.waitForTimeout(600);
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1000, 560, 900);
wide();
await page.waitForTimeout(1000);
await scene.finish();
