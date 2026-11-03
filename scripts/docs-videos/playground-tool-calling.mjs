// Docs: /docs/prompt-management/features/playground ("Tool calling and
// structured outputs"). Creates a get_order_status tool in the playground,
// sends a customer question, and shows the model's tool call. The seed
// (docs-demo-project) removes the tool again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const playgroundUrl = "http://localhost:3000/project/docs-demo/playground";
const SYSTEM =
  "You are Acme Robotics' support assistant. Use tools to look up orders.";
const USER = "Where is my replacement robot? Order A-21007.";
const TOOL = {
  name: "get_order_status",
  description: "Look up the shipping status of an order",
  parameters: JSON.stringify(
    {
      type: "object",
      properties: { order_id: { type: "string", description: "Order number" } },
      required: ["order_id"],
    },
    null,
    2,
  ),
};

const scene = await openScene("playground-tool-calling");
const { page, glideTo, glideClick, wide } = scene;

const tools = page.getByRole("button", { name: "Tools" });
const submit = page.getByRole("button", { name: "Submit" });
const editors = page.locator(".cm-content");
const loaded = async () => {
  await submit.waitFor({ timeout: 60_000 });
  await editors.nth(1).waitFor();
  await skeletonsGone(page);
};
const setEditor = async (index, text) => {
  await editors.nth(index).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
};

// Messages are set before the take; the tool is created on camera.
await page.goto(playgroundUrl);
await loaded();
await setEditor(0, SYSTEM);
await setEditor(1, USER);
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(1200);
await scene.placeCursor(1000, 560);

await scene.record();
await page.waitForTimeout(900);
wide();
await glideClick(tools, 900, { x: 0.4, y: 0.5 });
const createTool = page.getByRole("button", { name: "Create new tool" });
await createTool.waitFor();
await page.waitForTimeout(600);
await glideClick(createTool, 700, { x: 0.3, y: 0.5 });
const dialog = page.getByRole("dialog").last();
await dialog.waitFor();
await page.waitForTimeout(500);

const fields = dialog.locator("input, textarea");
await glideClick(fields.first(), 700, { x: 0.3, y: 0.5 });
await page.keyboard.type(TOOL.name, { delay: 45 });
await page.waitForTimeout(300);
await glideClick(fields.nth(1), 500, { x: 0.3, y: 0.5 });
await page.keyboard.type(TOOL.description, { delay: 25 });
await page.waitForTimeout(300);
const schemaEditor = dialog.locator(".cm-content").first();
await glideClick(schemaEditor, 600, { x: 0.3, y: 0.3 });
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.insertText(TOOL.parameters);
await page.waitForTimeout(1000);
const saveTool = dialog.getByRole("button", { name: /Create|Save/ }).last();
await glideClick(saveTool, 700, { x: 0.4, y: 0.5 });
// The tool is attached and listed in the Tools menu.
await scene.cut(async () => {
  await page
    .getByRole("button", { name: /Tools\s*1/ })
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
});
await page.waitForTimeout(1200);
await page.keyboard.press("Escape");
await page.waitForTimeout(900);

// Run it: the model answers with a call to the tool.
const submitBox = await submit.boundingBox();
await glideTo(submitBox.x + submitBox.width * 0.45, submitBox.y - 60, 800);
await glideClick(submit, 350, { x: 0.47, y: 0.5 });
let answered = false;
const answer = page
  .getByText("Tool called")
  .first()
  .waitFor({ timeout: 90_000 })
  .then(() => (answered = true));
await page.waitForTimeout(800);
await Promise.race([answer, page.waitForTimeout(3500)]);
if (!answered) await scene.cut(() => answer);
await page.waitForTimeout(400);
const outputBox = await page.getByText("Output", { exact: true }).boundingBox();
await glideTo(outputBox.x + 600, outputBox.y + 40, 800);
await page.waitForTimeout(2600);

await glideTo(1000, 560, 800);
await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(playgroundUrl);
  await loaded();
  await setEditor(0, SYSTEM);
  await setEditor(1, USER);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
