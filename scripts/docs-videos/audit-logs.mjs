// Docs: /docs/administration/audit-logs.
// Project Settings > Audit Logs: who changed what, and a before/after
// comparison of one change. Before the take, the data retention is set to
// 30 days through the UI so the newest entry is a readable settings change.
// Enterprise feature: start the web server with an EE license key.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const base = "http://localhost:3000/project/docs-demo/settings";

const scene = await openScene("audit-logs");
const { page, glideTo, glideClick, wide } = scene;

const logsLoaded = async () => {
  await page.getByRole("table", { name: "auditLogs" }).waitFor({
    timeout: 60_000,
  });
  await skeletonsGone(page);
  await page.waitForTimeout(600);
};

// A fresh, readable entry at the top: retention 30 days.
await page.goto(base);
await page.getByRole("heading", { name: "Data Retention" }).waitFor({
  timeout: 60_000,
});
await page.getByRole("spinbutton").first().fill("30");
await page.getByRole("button", { name: "Save", exact: true }).nth(1).click();
await page
  .getByText(/current retention is "30" days/)
  .first()
  .waitFor({ timeout: 30_000 });

await page.goto(`${base}/audit-logs`);
await logsLoaded();
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1200);
wide();
const firstRow = page
  .getByRole("table", { name: "auditLogs" })
  .getByRole("row")
  .nth(1);
const rb = await firstRow.boundingBox();
await glideTo(rb.x + 200, rb.y + rb.height / 2, 1000);
await page.waitForTimeout(900);
// Compare sits past the After column; scroll the table sideways first.
await page.evaluate(() => {
  const table = document.querySelector('table[aria-label="auditLogs"]');
  let el = table?.parentElement;
  while (el && el.scrollWidth <= el.clientWidth + 10) el = el.parentElement;
  el?.scrollBy({ left: 2000, behavior: "smooth" });
});
await page.waitForTimeout(1200);
await glideClick(firstRow.getByRole("button", { name: "Compare" }), 900);
await page.getByRole("dialog").waitFor();
await page.waitForTimeout(3200);
await glideTo(1000, 760, 800);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

await scene.cut(async () => {
  seed("docs-demo-project");
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollLeft > 0) el.scrollLeft = 0;
    }
  });
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
