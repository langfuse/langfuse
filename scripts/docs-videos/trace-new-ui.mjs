// Docs: /docs/observability/get-started (trace walkthrough).
// A RAG chat answer: cost and usage breakdowns on the generation, its
// collapsed chat history, and the retrieval span it was built from.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// Re-seeding writes a second copy of each v4 event row until ClickHouse merges
// them; force the merge before filming.
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8124";
for (const table of ["events_full", "events_core"]) {
  await fetch(CLICKHOUSE_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa("clickhouse:clickhouse")}` },
    body: `OPTIMIZE TABLE ${table} FINAL`,
  });
}
const scene = await openScene("trace-new-ui");
const { page, glideTo, glideClick, focus, wide } = scene;

const row = (name) => page.getByText(name, { exact: true }).first();
const loaded = () =>
  page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, {
    timeout: 30_000,
  });

// links[0] is the qa-answer trace (see the scenario's link order).
await page.goto(links[0]);
await row("fetch-prompt-from-langfuse").waitFor();
for (const name of ["retrieval", "generation"]) {
  await row(name).click();
  await page.waitForTimeout(300);
  await loaded();
}
const history = page.getByRole("button", { name: /\d+ other messages/ });
await history.waitFor();
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
await scene.placeCursor(1180, 700);
await page.waitForTimeout(400);

// The generation header (cost, usage, model, prompt) and its breakdowns.
const header = { x: 494, y: 110, width: 853, height: 480 };
// The generation's messages.
const messages = { x: 494, y: 130, width: 1042, height: 586 };
// Badges in the generation header; the trace header above repeats them.
const cost = page.getByText("$0.033", { exact: true }).last();
const usage = page.getByText("18k tokens", { exact: true }).last();

await scene.record();
await page.waitForTimeout(1000);
wide();
const costBox = await cost.boundingBox();
await glideTo(
  costBox.x + costBox.width / 2,
  costBox.y + costBox.height / 2,
  950,
);
focus(header, 1.8);
await page.getByText("Cost breakdown").first().waitFor();
await page.waitForTimeout(1800);
// The breakdown tooltip stays open while the pointer is near; Escape closes
// it before the next one opens.
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
const usageBox = await usage.boundingBox();
await glideTo(
  usageBox.x + usageBox.width / 2,
  usageBox.y + usageBox.height / 2,
  600,
);
await page.getByText("Usage breakdown").first().waitFor();
await page.waitForTimeout(1800);
await page.keyboard.press("Escape");
await page.waitForTimeout(250);

// Expand the collapsed chat history.
await glideClick(history, 800, { x: 0.03, y: 0.5 });
focus(messages, 1.47);
await page.waitForTimeout(600);
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 45);
  await page.waitForTimeout(40);
}
await page.waitForTimeout(1600);

// Jump to the retrieval span, then back to the generation.
focus(messages, 1.47);
await glideClick(row("retrieval"), 900, { x: 1.3, y: 0.5 });
wide();
await page.getByText("top_k").first().waitFor();
await scene.cut(loaded);
await page.waitForTimeout(2200);
await glideClick(row("generation"), 700, { x: 1.3, y: 0.5 });
await scene.cut(loaded);
await history.waitFor();
await page
  .getByText(/^prompt:/)
  .first()
  .waitFor();
await page.waitForTimeout(1500);
await glideTo(1180, 700, 900);
await page.waitForTimeout(1500);
await scene.finish();
