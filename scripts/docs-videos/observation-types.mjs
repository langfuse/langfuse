// Docs: /docs/observability/features/observation-types.
// A LangGraph agent trace whose steps carry their own types: the agent, its
// chain nodes, the model calls and the order-lookup tool. Opens the agent
// and the tool, then shows the same run as a graph, and filters the
// observations table to tool calls.
import { openScene, seed } from "./lib.mjs";
import { clearSidebarFilters, facetOnly } from "./sidebar-helpers.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// links[2] is the triage-graph LangGraph run.
const traceUrl = links[2];
const tracingUrl = "http://localhost:3000/project/docs-demo/observations";

const scene = await openScene("observation-types");
const { page, glideTo, glideClick, wide } = scene;

const treeTab = page.getByRole("tab", { name: "Tree" });
const graphTab = page.getByRole("tab", { name: "Graph" });
const node = (name, n = 0) =>
  page.getByRole("button", { name: new RegExp(`^${name} `) }).nth(n);
const traceLoaded = async () => {
  await treeTab.waitFor({ timeout: 60_000 });
  await node("lookup_order").waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
};
const tableLoaded = async () => {
  await page.getByText("Start Time").first().waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
};
const reset = async () => {
  await page.goto(tracingUrl);
  await tableLoaded();
  await clearSidebarFilters(page);
  await page.goto(traceUrl);
  await traceLoaded();
  if ((await treeTab.getAttribute("aria-selected")) !== "true") {
    await treeTab.click();
  }
};

// Render the graph once so its first layout is not on camera.
await page.goto(traceUrl);
await traceLoaded();
await graphTab.click();
await page.waitForTimeout(2000);
await treeTab.click();
await reset();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1200);
wide();

await glideClick(node("LangGraph"), 1000, { x: 0.25, y: 0.5 });
await scene.cut(() => skeletonsGone(page));
await page.waitForTimeout(1600);
await glideClick(node("lookup_order"), 900, { x: 0.25, y: 0.5 });
await scene.cut(() => skeletonsGone(page));
await page.waitForTimeout(1800);

await glideClick(graphTab, 900);
await page.waitForTimeout(3000);
await glideTo(560, 520, 900);
await page.waitForTimeout(1200);

// Every tool call in the project, from the table's Type filter.
await glideClick(page.getByRole("link", { name: "Tracing" }), 900);
await scene.cut(tableLoaded);
await page.waitForTimeout(900);
await facetOnly(scene, "Type More information", "TOOL");
await scene.cut(async () => {
  await page.waitForTimeout(700);
  await skeletonsGone(page, 60_000);
});
await page.waitForTimeout(2400);

await glideTo(1000, 640, 800);
await scene.cut(async () => {
  await reset();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
