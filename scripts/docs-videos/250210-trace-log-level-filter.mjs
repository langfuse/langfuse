// Docs: /docs/observability/features/log-levels.
// A LangGraph-style trace hides its DEBUG-level internals by default: "Show
// all" reveals them, and View Options > Min Level > DEFAULT hides them again.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// Re-seeding writes a second copy of each v4 event row until ClickHouse merges
// them, and the graph/aggregates count both; force the merge before filming.
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8124";
for (const table of ["events_full", "events_core"]) {
  await fetch(CLICKHOUSE_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa("clickhouse:clickhouse")}` },
    body: `OPTIMIZE TABLE ${table} FINAL`,
  });
}
const scene = await openScene("250210-trace-log-level-filter");
const { page, glideTo, glideClick, focus, wide } = scene;

// links[2] is the triage-graph trace (see the scenario's link order).
await page.goto(links[2]);
await page.getByText("lookup_order").first().waitFor();
// Warm the DEBUG rows once, then return to the default minimum level.
await page.getByText("Show all", { exact: true }).click();
await page.getByText("ChannelWrite<tools,messages>").waitFor();
await page.evaluate(() =>
  localStorage.setItem("minObservationLevel", JSON.stringify("DEFAULT")),
);
await page.reload();
await page.getByText("Show all", { exact: true }).waitFor();
await page.getByText("ChatOpenAI").first().click();
await page.waitForTimeout(1500);
// Dismiss any toast (e.g. a slow-query warning) before the take.
for (const toast of await page.locator("[data-sonner-toast]").all()) {
  await toast
    .getByRole("button")
    .first()
    .click()
    .catch(() => {});
}
await page.waitForTimeout(500);
// The screencast can drop the last paint before the page goes idle; a
// near-invisible ticking pixel keeps frames coming.
await page.evaluate(() => {
  const style = document.createElement("style");
  style.textContent =
    "@keyframes demo-tick{from{opacity:0.01}to{opacity:0.02}}.demo-tick{position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;pointer-events:none;background:#000;animation:demo-tick .1s steps(2) infinite}";
  document.head.appendChild(style);
  const tick = document.createElement("div");
  tick.className = "demo-tick";
  document.body.appendChild(tick);
});
await scene.placeCursor(1180, 640);
await page.waitForTimeout(400);

const treeArea = { x: 40, y: 110, width: 1000, height: 563 };
// A narrow tree panel folds View Options into the "More" menu.
const viewOptions = page.getByTitle("More", { exact: true });

await scene.record();
await page.waitForTimeout(1000);
wide();
const showAll = page.getByText("Show all", { exact: true });
const showAllBox = await showAll.boundingBox();
await glideTo(showAllBox.x + 60, showAllBox.y + 80, 900);
focus(treeArea, 1.536);
await glideClick(showAll, 400);
await page.getByText("ChannelWrite<tools,messages>").waitFor();
await glideTo(showAllBox.x - 40, 420, 700);
await page.waitForTimeout(1500);

await glideClick(viewOptions, 700);
const minLevel = page.getByRole("menuitem", { name: /Min Level/ });
await minLevel.waitFor();
await page.waitForTimeout(400);
await glideClick(minLevel, 500, { x: 0.15, y: 0.5 });
const defaultLevel = page.getByRole("menuitem", {
  name: "DEFAULT",
  exact: true,
});
await defaultLevel.waitFor();
await page.waitForTimeout(500);
await glideClick(defaultLevel, 500, { x: 0.12, y: 0.5 });
await showAll.waitFor();
await page.waitForTimeout(1300);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.getByRole("menu").first().waitFor({ state: "hidden" });
// Closing returns focus to the menu button; drop it so the last frame
// matches the first.
await page.waitForTimeout(300);
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(500);
focus(treeArea, 1.536);
await glideTo(1180, 640, 1000);
wide();
await page.waitForTimeout(1000);
await scene.finish();
