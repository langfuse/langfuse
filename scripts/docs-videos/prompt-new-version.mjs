// Docs: /docs landing page, Prompt Management > Version Control tab.
// Saves a new version of a chat prompt with an edited system message and a
// commit message; the version list then shows it on top. The seed removes
// versions added by earlier takes.
import { openScene, seed } from "./lib.mjs";
import { smoothScroll, skeletonsGone } from "./scroll-helpers.mjs";

const { links } = seed("docs-demo-prompts", ["--project", "docs-demo"]);
const promptUrl = `${links[0]}/support-reply`;
const ADDED = " Always confirm the order number before changing an order.";
const COMMIT = "Confirm order numbers";

const scene = await openScene("prompt-new-version");
const { page, glideTo, glideClick, wide } = scene;

const newVersion = page.getByRole("link", { name: "New version" });
const promptLoaded = async () => {
  await newVersion.waitFor({ timeout: 60_000 });
  await page.getByText("Pass customer name").first().waitFor();
  await skeletonsGone(page);
};
const systemEditor = page.locator(".cm-content").first();

// Compile the form route once.
await page.goto(promptUrl);
await promptLoaded();
await newVersion.click();
await systemEditor.waitFor({ timeout: 60_000 });
await page.goto(promptUrl);
await promptLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1180, 640);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(newVersion, 900, { x: 0.15, y: 0.5 });
await scene.cut(async () => {
  await page.waitForURL(/prompts\/new/);
  await systemEditor.waitFor();
  await page.waitForTimeout(600);
});

// Append a rule to the end of the system message.
await glideClick(systemEditor, 800, { x: 0.6, y: 0.5 });
await page.keyboard.press("ControlOrMeta+End");
await page.keyboard.type(ADDED, { delay: 30 });
await page.waitForTimeout(1000);

// Commit message, then save.
await glideTo(900, 560, 600);
await smoothScroll(page, 1400, { x: 900, y: 560 }, 1300);
const commit = page.getByPlaceholder("Add commit message...");
await glideClick(commit, 700, { x: 0.1, y: 0.5 });
await page.keyboard.type(COMMIT, { delay: 50 });
await page.waitForTimeout(500);
const save = page.getByRole("button", { name: "Save new prompt version" });
await glideClick(save, 700, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  await page.waitForURL((url) => !url.pathname.endsWith("/new"));
  await page.getByText(COMMIT).first().waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(1200);
// The new version sits on top of the list, with its commit message.
const entry = page.getByText(COMMIT).first();
await glideTo(
  ...(await entry
    .boundingBox()
    .then((b) => [b.x + b.width + 80, b.y + b.height / 2])),
  800,
);
await page.waitForTimeout(2000);

await glideTo(1180, 640, 800);
await scene.cut(async () => {
  seed("docs-demo-prompts", ["--project", "docs-demo"]);
  await page.goto(promptUrl);
  await promptLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
