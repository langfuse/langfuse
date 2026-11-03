// Docs: /faq/all/where-are-langfuse-api-keys.
// Project Settings > API Keys > Create new API keys: name the key, create
// it, and see the secret key, public key and host with the setup snippet;
// then the key in the list. docs-demo-project removes the key again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const settingsUrl = "http://localhost:3000/project/docs-demo/settings";

const scene = await openScene("create-api-keys");
const { page, glideTo, glideClick, wide } = scene;

const apiKeysNav = page.getByText("API Keys", { exact: true }).first();
const create = page.getByRole("button", { name: "Create new API keys" });
const generalLoaded = () => page.getByText("Debug Information").waitFor();

// Compile the API keys route once.
await page.goto(`${settingsUrl}/api-keys`);
await create.waitFor({ timeout: 60_000 });
await page.goto(settingsUrl);
await generalLoaded();
await page.waitForTimeout(1200);
await scene.placeCursor(980, 330);

await scene.record();
await page.waitForTimeout(700);
wide();
await glideClick(apiKeysNav, 900, { x: 0.15, y: 0.5 });
await scene.cut(async () => {
  await create.waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(900);
await glideClick(create, 850, { x: 0.3, y: 0.5 });

const dialog = page.getByRole("dialog");
const nameInput = dialog.getByPlaceholder(/Production server/);
await nameInput.waitFor();
await page.waitForTimeout(500);
await glideClick(nameInput, 700, { x: 0.3, y: 0.5 });
await page.keyboard.type("Support chatbot", { delay: 55 });
await page.waitForTimeout(500);
await glideClick(dialog.getByRole("button", { name: "Create API key" }), 800, {
  x: 0.4,
  y: 0.5,
});
await scene.cut(async () => {
  await page.getByText("Secret Key").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
});
await page.waitForTimeout(1200);
// The keys, then the setup snippet.
const publicKey = dialog.getByText("Public Key").first();
await glideTo(
  ...(await publicKey
    .boundingBox()
    .then((b) => [b.x + b.width + 260, b.y + b.height + 20])),
  900,
);
await page.waitForTimeout(1400);
const tabs = dialog.getByRole("tab");
if ((await tabs.count()) > 1) {
  await glideClick(tabs.nth(1), 800, { x: 0.5, y: 0.5 });
  await page.waitForTimeout(1800);
}
await glideClick(dialog.getByRole("button", { name: "Close" }).first(), 800);
await dialog.waitFor({ state: "hidden" });
// The new key is listed under the existing one.
await page.waitForTimeout(400);
await glideTo(980, 420, 800);
await page.waitForTimeout(1800);

await glideClick(page.getByText("General", { exact: true }).first(), 900, {
  x: 0.15,
  y: 0.5,
});
await scene.cut(generalLoaded);
await page.waitForTimeout(400);
await glideTo(980, 330, 800);
await page.waitForTimeout(900);
await scene.finish();
seed("docs-demo-project");
