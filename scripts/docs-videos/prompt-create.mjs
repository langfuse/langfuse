// Docs: /docs landing page, Prompt Management > Create tab, and
// /docs/prompt-management/get-started. Creates a text prompt with two
// variables and the production label. The seed deletes it again so every
// take starts without it.
import { openScene, seed } from "./lib.mjs";
import { smoothScroll, skeletonsGone } from "./scroll-helpers.mjs";

const { links } = seed("docs-demo-prompts", ["--project", "docs-demo"]);
const promptsUrl = links[0];
const NAME = "order-status-reply";
const TEXT =
  "Write a short, friendly reply to {{customer_name}} about order {{order_id}}. Include the delivery date and the tracking link.";

const scene = await openScene("prompt-create");
const { page, glideTo, glideClick, wide } = scene;

const newPrompt = page.getByRole("link", { name: "New prompt" });
const listLoaded = async () => {
  await newPrompt.waitFor({ timeout: 60_000 });
  await page.getByText("support-reply").first().waitFor();
  await skeletonsGone(page);
};
const nameInput = page.getByPlaceholder("Name your prompt");
const editor = page.locator(".cm-content:visible").first();

// Compile the form route once.
await page.goto(`${promptsUrl}/new`);
await editor.waitFor({ timeout: 60_000 });
await page.goto(promptsUrl);
await listLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(newPrompt, 1000, { x: 0.4, y: 0.5 });
await scene.cut(async () => {
  await editor.waitFor();
  await page.waitForTimeout(500);
});

await glideClick(nameInput, 800, { x: 0.12, y: 0.5 });
await page.keyboard.type(NAME, { delay: 55 });
await page.waitForTimeout(400);

await glideClick(editor, 700, { x: 0.15, y: 0.1 });
await page.keyboard.type(TEXT, { delay: 22 });
await page.waitForTimeout(1200);

// The variables are detected below the editor; then save.
await glideTo(900, 560, 600);
await smoothScroll(page, 600, { x: 900, y: 560 }, 1300);
const create = page.getByRole("button", { name: "Create prompt" });
await glideClick(create, 800, { x: 0.4, y: 0.5 });
await scene.cut(async () => {
  await page.waitForURL((url) => url.pathname.endsWith(`/prompts/${NAME}`));
  await page.getByText("production", { exact: true }).first().waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(2400);

// Back to the list for a seamless loop.
await glideTo(1000, 600, 800);
await scene.cut(async () => {
  await page.goto(promptsUrl);
  await listLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
// Remove the prompt again so the list matches the start of the next take.
seed("docs-demo-prompts", ["--project", "docs-demo"]);
