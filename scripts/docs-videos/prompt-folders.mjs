// Docs: /docs/prompt-management/features/folders. Creates a prompt whose
// name contains a slash and opens the folder it creates in the prompt list.
// The seed deletes the prompt again so every take starts without it.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-prompts", ["--project", "docs-demo"]);
const promptsUrl = links[0];

const scene = await openScene("prompt-folders");
const { page, glideTo, glideClick, wide } = scene;

// Warm the create form so the take does not wait on a dev-server compile.
await page.goto(`${promptsUrl}/new`);
await page.getByPlaceholder("Name your prompt").waitFor();
await page.goto(promptsUrl);
await page.getByText("billing", { exact: true }).waitFor();
await page.waitForTimeout(1200);
await scene.placeCursor(1180, 640);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(page.getByText("New prompt", { exact: true }), 900, {
  x: 0.12,
  y: 0.5,
});
const name = page.getByPlaceholder("Name your prompt");
await scene.cut(async () => {
  await name.waitFor();
  await page.waitForTimeout(500);
});
wide();

await glideClick(name, 700, { x: 0.12, y: 0.5 });
await page.keyboard.type("onboarding/welcome-email", { delay: 10 });
await page.waitForTimeout(300);
const editor = page.locator(".cm-content").first();
await glideClick(editor, 600, { x: 0.25, y: 0.3 });
// Typing into the editor re-renders the whole form per key; insert at once.
await page.keyboard.insertText("Welcome {{name}} to Acme!");
await page.waitForTimeout(500);

// "Set the production label" is checked by default; create the prompt.
const create = page.getByRole("button", { name: "Create prompt" });
wide();
await glideTo(900, 560, 450);
for (let i = 0; i < 14; i++) {
  await page.mouse.wheel(0, 50);
  await page.waitForTimeout(25);
}
await page.waitForTimeout(250);
await glideClick(create, 700, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  await page.waitForURL((url) => url.pathname.includes("welcome-email"));
  await page.getByText("Welcome {{name}} to Acme!").first().waitFor();
  await page.waitForTimeout(300);
});
await page.waitForTimeout(700);

// Back in the list, the slash became a folder.
// The breadcrumb link, not the icon-rail entry (which shows a tooltip).
const promptLinks = await page
  .getByRole("link", { name: "Prompts", exact: true })
  .all();
let breadcrumb;
for (const link of promptLinks) {
  const box = await link.boundingBox();
  if (box && box.x > 100 && box.y < 40) breadcrumb = link;
}
await glideClick(breadcrumb, 800);
const folder = page.locator("td").getByText("onboarding", { exact: true });
// The list refetches and can re-render under the first click; confirm.
await scene.cut(async () => {
  await folder.waitFor();
  await page.waitForTimeout(1200);
});
await page.waitForTimeout(300);
const promptRow = page
  .locator("td")
  .getByText("welcome-email", { exact: true });
for (
  let attempt = 0;
  attempt < 3 && !(await promptRow.isVisible()) && (await folder.isVisible());
  attempt++
) {
  await glideClick(folder, attempt ? 300 : 800, { x: 0.5, y: 0.5 });
  await scene.cut(async () => {
    await promptRow.waitFor({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(300);
  });
}
await promptRow.waitFor();
await page.evaluate(() => document.activeElement?.blur());
await glideTo(700, 520, 600);
await page.waitForTimeout(1800);
wide();
await page.waitForTimeout(900);
await scene.finish();
