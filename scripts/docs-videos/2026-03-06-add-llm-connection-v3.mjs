// Docs: /docs/administration/llm-connection ("Add an LLM connection").
// Project Settings -> LLM Connections -> + Project Connection, fills the
// dialog with a placeholder key and closes it without creating anything.
import { openScene, seed } from "./lib.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const scene = await openScene("2026-03-06-add-llm-connection-v3");
const { page, glideTo, glideClick, wide } = scene;

// Starts and ends on Project Settings > General: Home's charts reload on
// return and would make the loop seam jump.
await page.goto("http://localhost:3000/project/docs-demo/settings");
await page.getByText("Debug Information").waitFor();
await page.waitForTimeout(1500);
await scene.placeCursor(980, 330);

await scene.record();
await page.waitForTimeout(1000);
const llmTab = page.getByText("LLM Connections", { exact: true }).first();
await glideClick(llmTab, 1000, { x: 0.15, y: 0.5 });
const addButton = page.getByRole("button", { name: "Project Connection" });
await addButton.waitFor();
await page.getByText("staging.langfuse.com", { exact: false }).waitFor();
await page.waitForTimeout(800);
await glideClick(addButton, 850, { x: 0.12, y: 0.5 });

const dialog = page.getByRole("dialog");
await dialog.getByText("New LLM Connection").waitFor();
await page.waitForTimeout(250);
const box = await dialog.boundingBox();
const dialogArea = {
  x: box.x - 40,
  y: box.y - 20,
  width: box.width + 80,
  height: box.height + 40,
};
wide();
await glideClick(dialog.locator('input[name="provider"]'), 650, {
  x: 0.6,
  y: 0.5,
});
await page.keyboard.type("openai-support", { delay: 55 });
await page.waitForTimeout(300);
await glideClick(dialog.locator('input[name="secretKey"]'), 550, {
  x: 0.6,
  y: 0.5,
});
await page.keyboard.type("sk-proj-demo-placeholder", { delay: 40 });
await page.waitForTimeout(900);
// Not submitted: close the dialog and return to General.
await glideClick(dialog.getByRole("button", { name: "Close" }).first(), 700);
await dialog.waitFor({ state: "hidden" });
await page.waitForTimeout(300);
wide();
await page.waitForTimeout(400);
await glideClick(page.getByText("General", { exact: true }).first(), 900, {
  x: 0.15,
  y: 0.5,
});
await page.getByText("Debug Information").waitFor();
await page.waitForTimeout(400);
await glideTo(980, 330, 900);
wide();
await page.waitForTimeout(1000);
await scene.finish();
