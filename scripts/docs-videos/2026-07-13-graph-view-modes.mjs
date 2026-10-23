// Docs: /docs/observability/features/agent-graphs ("Graph view modes").
// The Graph tab of the support-copilot trace: select the aggregated
// `llm.chat (3/3)` loop node, switch to Expanded to see the as-it-ran DAG,
// pick a tool call, and switch back.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("support-agent", [
  "--project",
  "docs-demo",
  "--v4",
  "--id-prefix",
  "0198f3c27d5e8a41",
]);
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
const scene = await openScene("2026-07-13-graph-view-modes");
const { page, glideTo, glideClick, focus, wide } = scene;

await page.goto(links[0]);
await page.getByText("draft-response").first().waitFor();
await page.getByText("Graph", { exact: true }).first().click();
await page.getByText("Aggregated", { exact: true }).waitFor();
// Widen the navigation panel so graph labels stay legible.
const handle = await page.locator('[role="separator"]').first().boundingBox();
await page.mouse.move(handle.x, 500);
await page.mouse.down();
await page.mouse.move(800, 500, { steps: 10 });
await page.mouse.move(960, 500, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(1500);

const node = (name, nth = 0) => page.getByText(name, { exact: true }).nth(nth);
// Click a node on its type icon (left of the label) so the cursor does not
// cover the name.
const onIcon = { x: -0.25, y: 0.5 };
/** Waits until the detail pane has replaced its skeletons with content. */
const loaded = () =>
  page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, {
    timeout: 30_000,
  });
// Warm the observation detail queries so no skeletons show on camera.
await node("llm.chat").click();
await page.waitForTimeout(300);
await loaded();
await page.getByText("Expanded", { exact: true }).click();
await node("stripe.find-charges").waitFor();
for (const [name, nth] of [
  ["stripe.find-charges", 0],
  ["llm.chat", 2],
]) {
  await node(name, nth).click();
  await page.waitForTimeout(300);
  await loaded();
}
await page.getByText("Aggregated", { exact: true }).click();
await page.waitForTimeout(1000);
// Start (and end) on the draft-response generation.
await node("draft-response").click();
await page.getByText("Draft a friendly").first().waitFor();
await loaded();
await page.waitForTimeout(800);
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
await scene.placeCursor(1240, 700);
await page.waitForTimeout(400);

// Graph plus the selected observation's header.
const graphArea = { x: 40, y: 165, width: 1182, height: 665 };

await scene.record();
await page.waitForTimeout(1000);
wide();
const loop = await node("llm.chat").boundingBox();
await glideTo(loop.x + 60, loop.y + 60, 900);
focus(graphArea, 1.3);
await glideClick(node("llm.chat"), 400, onIcon);
await scene.cut(loaded);
await page.waitForTimeout(1200);

await glideClick(page.getByText("Expanded", { exact: true }), 750);
await scene.cut(() => node("stripe.find-charges").waitFor());
await scene.cut(loaded);
await page.waitForTimeout(1400);
await glideClick(node("stripe.find-charges"), 700, onIcon);
await scene.cut(loaded);
await page.waitForTimeout(1100);
await glideClick(node("llm.chat", 2), 600, onIcon);
await scene.cut(loaded);
await page.waitForTimeout(1300);

await glideClick(page.getByText("Aggregated", { exact: true }), 750);
await scene.cut(() => node("llm.chat").waitFor());
await page.waitForTimeout(1300);
await glideClick(node("draft-response"), 650, onIcon);
await scene.cut(loaded);
await page.waitForTimeout(900);
focus(graphArea, 1.3);
await glideTo(1240, 700, 900);
wide();
await page.waitForTimeout(1000);
await scene.finish();
