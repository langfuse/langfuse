// Docs: /docs/prompt-management/features/prompt-version-control
// ("Protected prompt labels"). Project Settings > Protected Labels: protects
// production, then staging. Enterprise feature: start the web server with
// LANGFUSE_EE_LICENSE_KEY. docs-demo-prompts removes the protected labels.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-prompts", ["--project", "docs-demo"]);
const settingsUrl = "http://localhost:3000/project/docs-demo/settings";

const scene = await openScene("250402-protected-prompt-labels");
const { page, glideTo, glideClick, wide } = scene;

const nav = page.getByText("Protected Labels", { exact: true }).first();
const picker = page
  .getByRole("combobox")
  .filter({ hasText: /Select or enter a label/ })
  .or(page.getByPlaceholder(/Select or enter a label/))
  .first();
const add = page.getByRole("button", { name: "Add", exact: true });
const generalLoaded = () => page.getByText("Debug Information").waitFor();

await page.goto(`${settingsUrl}/protected-prompt-labels`);
await picker.waitFor({ timeout: 60_000 });
await page.goto(settingsUrl);
await generalLoaded();
await page.waitForTimeout(1200);
await scene.placeCursor(980, 330);

const protect = async (label) => {
  await glideClick(picker, 800, { x: 0.3, y: 0.5 });
  await page.waitForTimeout(400);
  await page.keyboard.type(label, { delay: 70 });
  const option = page.getByRole("option", { name: label, exact: true }).first();
  await option.waitFor();
  await page.waitForTimeout(500);
  await glideClick(option, 600, { x: 0.2, y: 0.5 });
  await page.waitForTimeout(400);
  await glideClick(add, 600);
  await scene.cut(async () => {
    await page
      .locator("main")
      .getByText(label, { exact: true })
      .first()
      .waitFor();
    await page.waitForTimeout(400);
  });
  await page.waitForTimeout(1200);
};

await scene.record();
await page.waitForTimeout(700);
wide();
await glideClick(nav, 900, { x: 0.15, y: 0.5 });
await scene.cut(async () => {
  await picker.waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(900);
await protect("production");
await protect("staging");
await glideTo(980, 420, 700);
await page.waitForTimeout(1600);

await glideClick(page.getByText("General", { exact: true }).first(), 900, {
  x: 0.15,
  y: 0.5,
});
await scene.cut(generalLoaded);
await page.waitForTimeout(400);
await glideTo(980, 330, 800);
await page.waitForTimeout(900);
await scene.finish();
seed("docs-demo-prompts", ["--project", "docs-demo"]);
