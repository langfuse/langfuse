// Docs: /docs/observability/features/url ("Share trace via URL").
// Makes a seeded trace public from the trace header menu, with the
// draft-response generation selected as in the original video.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("support-agent", [
  "--project",
  "docs-demo",
  "--v4",
  "--id-prefix",
  "0198f2ab41c7e93d",
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
const scene = await openScene("share-trace");
const { page, glideTo, glideClick, focus, wide } = scene;
const moreActions = page.getByRole("button", { name: "More actions" });

// Start every take from a private trace so the scene is re-runnable.
await page.goto(links[0]);
await moreActions.click();
const unshare = page.getByRole("menuitem", { name: "Unshare" });
if (await unshare.isVisible()) {
  await unshare.click();
  await page.waitForTimeout(1500);
}
// Reload so the menu button carries no focus ring into the take.
await page.reload();
await page.getByText("draft-response").first().waitFor();

// Frame per product-screenshot-capture: whole tree visible, the generation
// selected (lib.mjs already collapses the nav).
// Tree chevrons carry no accessible name; they sit just right of the view
// tabs. The tree can re-render under the first click, so confirm and retry.
const childRow = page.getByText("crm.get-customer");
for (let attempt = 0; attempt < 3 && (await childRow.isVisible()); attempt++) {
  const graphTab = await page
    .getByText("Graph", { exact: true })
    .first()
    .boundingBox();
  const loadContext = await page
    .getByText("load-context")
    .first()
    .boundingBox();
  await page.mouse.click(
    graphTab.x + graphTab.width + 14,
    loadContext.y + loadContext.height / 2,
  );
  await page.waitForTimeout(500);
}
await childRow.waitFor({ state: "hidden" });
await page.getByText("draft-response").first().click();
await page.waitForTimeout(1200);
await scene.placeCursor(1180, 640);
await page.waitForTimeout(400);

const menuButton = await moreActions.boundingBox();
const headerActions = { x: 1136, y: 0, width: 400, height: 300 };

await scene.record();
await page.waitForTimeout(900);
wide();
// One continuous glide to the menu button: a stop on the way would rest the
// cursor on the observation's Comment button.
await glideTo(
  menuButton.x + menuButton.width / 2,
  menuButton.y + menuButton.height / 2,
  1200,
);
focus(headerActions, 1.8);
await glideClick(moreActions, 150);
await page.waitForTimeout(650);
// Click on the item's icon so the cursor does not cover its label.
const onIcon = { x: 0.1, y: 0.5 };
await glideClick(
  page.getByRole("menuitem", { name: "Make Public" }),
  450,
  onIcon,
);

const toast = page.getByText("shared publicly").first();
await scene.cut(() => toast.waitFor());
// Rest in the empty stretch of the tab row, clear of the toast and of the
// observation's action buttons.
const tabs = await page.getByRole("tab", { name: "Log View" }).boundingBox();
await glideTo(tabs.x + tabs.width + 260, tabs.y + tabs.height / 2, 650);
await page.waitForTimeout(1700);
// Dismiss the toast and reopen the menu: it now offers the public-state
// actions, and the take ends on the same toast-free view it started from.
const toastClose = page
  .locator("[data-sonner-toast]")
  .getByRole("button")
  .first();
await glideClick(toastClose, 550);
await toast.waitFor({ state: "hidden" });
await glideClick(moreActions, 500);
const copyLink = await page
  .getByRole("menuitem", { name: "Copy share link" })
  .boundingBox();
await glideTo(
  copyLink.x + copyLink.width * onIcon.x,
  copyLink.y + copyLink.height / 2,
  450,
);
await page.waitForTimeout(1300);
await page.keyboard.press("Escape");
// Closing returns focus to the menu button; drop it so the last frame
// matches the first.
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(250);
focus(headerActions, 1.8);
await glideTo(1180, 640, 1000);
wide();
await page.waitForTimeout(900);
await scene.finish();
