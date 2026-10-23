// Docs: /docs/security-and-guardrails (PII redaction).
// A call-summary trace: `anonymize` replaces names, emails and phone numbers
// with placeholders, the `summarize` generation only sees the placeholders,
// and `deanonymize` restores them in the final output.
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
const scene = await openScene("security-pii-redaction");
const { page, glideTo, glideClick, wide } = scene;

const row = (name) => page.getByText(name, { exact: true }).first();
/** Waits until the detail pane shows `name` and has finished loading. */
const selected = async (name) => {
  await page.waitForFunction(
    (n) =>
      [...document.querySelectorAll("span")].some((e) => {
        const r = e.getBoundingClientRect();
        return e.textContent === n && r.x > 500 && r.y < 160;
      }),
    name,
    { timeout: 30_000 },
  );
  await loaded();
};
const loaded = () =>
  page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, {
    timeout: 30_000,
  });

// links[1] is the summarize-call trace (see the scenario's link order).
await page.goto(links[1]);
await row("deanonymize").waitFor();
// Warm every observation, then start on the generation.
for (const name of ["anonymize", "deanonymize", "summarize"]) {
  await row(name).click();
  await selected(name);
}
await page.getByText("Summarize the support call transcript").first().waitFor();
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
await scene.placeCursor(1180, 700);
await page.waitForTimeout(400);

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

await scene.record();
await page.waitForTimeout(1600);
wide();
// Click the row just right of each label so the cursor never covers it.
const beside = { x: 1.4, y: 0.5 };
for (const name of ["anonymize", "summarize", "deanonymize"]) {
  await glideClick(row(name), 800, beside);
  await scene.cut(() => selected(name));
  await page.waitForTimeout(2400);
}
await glideClick(row("summarize"), 650, beside);
await scene.cut(() => selected("summarize"));
await page.waitForTimeout(1200);
await glideTo(1180, 700, 900);
await page.waitForTimeout(1000);
await scene.finish();
