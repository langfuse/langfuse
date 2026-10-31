// Docs: /docs/administration/llm-connection ("Add an LLM connection").
// Project Settings -> LLM Connections -> + Project Connection, fills the
// dialog and creates the connection, which then appears in the list.
import { openScene, seed } from "./lib.mjs";

// docs-demo-project removes the connection an earlier take created.
seed("docs-demo-project");
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const scene = await openScene("2026-03-06-add-llm-connection-v3");
const { page, glideTo, glideClick, wide } = scene;

const PROVIDER = "openai-support";
const llmTab = page.getByText("LLM Connections", { exact: true }).first();
const addButton = page.getByRole("button", { name: "Project Connection" });
const connectionsLoaded = async () => {
  await addButton.waitFor({ timeout: 90_000 });
  await page.getByText("staging.langfuse.com", { exact: false }).waitFor();
};

// The form checks the key with the provider before saving. The placeholder
// key would fail that check, so answer it as a valid key would; the
// connection itself is created by the real endpoint.
await page.route("**/api/trpc/llmApiKey.test*", async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  const pass = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.success === false) {
      node.success = true;
      delete node.error;
    }
    Object.values(node).forEach(pass);
  };
  pass(body);
  await route.fulfill({ response, json: body });
});

// Compile and load the LLM Connections page once so the take does not wait
// on it. Starts and ends on Project Settings > General: Home's charts reload
// on return and would make the loop seam jump.
await page.goto(
  "http://localhost:3000/project/docs-demo/settings/llm-connections",
);
await connectionsLoaded();
await page.goto("http://localhost:3000/project/docs-demo/settings");
await page.getByText("Debug Information").waitFor();
await page.waitForTimeout(1500);
await scene.placeCursor(980, 330);

await scene.record();
await page.waitForTimeout(700);
await glideClick(llmTab, 900, { x: 0.15, y: 0.5 });
await scene.cut(connectionsLoaded);
await page.waitForTimeout(900);
await glideClick(addButton, 850, { x: 0.12, y: 0.5 });

const dialog = page.getByRole("dialog");
await dialog.getByText("New LLM Connection").waitFor();
await page.waitForTimeout(250);
wide();
await glideClick(dialog.locator('input[name="provider"]'), 650, {
  x: 0.6,
  y: 0.5,
});
await page.keyboard.type(PROVIDER, { delay: 55 });
await page.waitForTimeout(300);
await glideClick(dialog.locator('input[name="secretKey"]'), 550, {
  x: 0.6,
  y: 0.5,
});
await page.keyboard.type("sk-proj-demo-placeholder", { delay: 40 });
await page.waitForTimeout(700);
await glideClick(
  dialog.getByRole("button", { name: "Create connection" }),
  750,
  { x: 0.4, y: 0.5 },
);
await scene.cut(async () => {
  await dialog.waitFor({ state: "hidden", timeout: 30_000 });
  await page.getByText(PROVIDER, { exact: true }).first().waitFor();
});
// The new connection is listed under Project connections.
const row = await page
  .getByText(PROVIDER, { exact: true })
  .first()
  .boundingBox();
await glideTo(row.x + row.width + 220, row.y + row.height / 2 + 40, 800);
await page.waitForTimeout(2000);

await glideClick(page.getByText("General", { exact: true }).first(), 900, {
  x: 0.15,
  y: 0.5,
});
await scene.cut(() => page.getByText("Debug Information").waitFor());
await page.waitForTimeout(400);
await glideTo(980, 330, 900);
wide();
await page.waitForTimeout(1000);
await scene.finish();
// Remove the placeholder-key connection again: the playground scenes would
// otherwise pick it as their model provider.
seed("docs-demo-project");
