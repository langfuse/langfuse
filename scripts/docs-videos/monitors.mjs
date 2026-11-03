// Docs: /docs/observability/features/alerts.
// Creates a monitor on p95 observation latency over the past hour from the
// empty Alerts page, with the live preview following each change, and
// sends it to the seeded "On-call webhook" automation (ticked by default).
// docs-demo-project deletes the monitor again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone, smoothScroll } from "./scroll-helpers.mjs";

seed("docs-demo-project");
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const base = "http://localhost:3000/project/docs-demo";

const scene = await openScene("monitors");
const { page, glideTo, glideClick, wide } = scene;

const createLink = page.getByRole("link", { name: "Create Alert" });
const alertsLoaded = async () => {
  await createLink.waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
};
const previewDrawn = async () => {
  await page
    .getByRole("group", { name: / chart$/i })
    .first()
    .waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
  await page.waitForTimeout(500);
};
const pick = async (combobox, option, at = { x: 0.3, y: 0.5 }) => {
  await glideClick(combobox, 800, at);
  const item = page.getByRole("option", { name: option, exact: true });
  await item.waitFor();
  await page.waitForTimeout(450);
  await glideClick(item, 600, { x: 0.25, y: 0.5 });
  await page.waitForTimeout(500);
};
// Scrolls the form so `locator` sits near `y`, with the cursor over the form.
const scrollFormTo = async (locator, y) => {
  const box = await locator.boundingBox();
  await smoothScroll(page, box.y - y, { x: 390, y: 600 }, 1000);
};

// Compile the form route once.
await page.goto(`${base}/alerts/new`);
await page.getByRole("heading", { name: "New Alert" }).waitFor({
  timeout: 60_000,
});
await page.goto(`${base}/alerts`);
await alertsLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(900);
wide();
await glideClick(createLink, 1000);
await scene.cut(previewDrawn);
await page.waitForTimeout(1200);

const form = page.getByRole("main").last();
await pick(form.getByRole("combobox", { name: "Measure" }), "Latency");
await pick(form.getByRole("combobox", { name: "Aggregation" }), "p95");
await scene.cut(previewDrawn);
await page.waitForTimeout(1000);

const threshold = form.getByRole("spinbutton").first();
await scrollFormTo(threshold, 360);
await glideClick(threshold, 800, { x: 0.3, y: 0.5 });
await page.keyboard.press("ControlOrMeta+a");
// Latency thresholds are in milliseconds.
await page.keyboard.type("8000", { delay: 90 });
await page.waitForTimeout(600);
const windowSelect = form.getByRole("combobox").filter({ hasText: "minutes" });
await pick(windowSelect, "1 hour");
await scene.cut(previewDrawn);
await page.waitForTimeout(1600);

const create = page.getByRole("button", { name: "Create Alert" });
await scrollFormTo(create, 760);
// The project's only monitor automation is ticked already.
const oncall = form.getByRole("button", { name: /On-call webhook/ });
const box = await oncall.boundingBox();
await glideTo(box.x + 120, box.y + box.height / 2, 900);
await page.waitForTimeout(1200);
await glideClick(create, 900);
await scene.cut(async () => {
  await page.waitForFunction(() => !location.pathname.endsWith("/new"), null, {
    timeout: 30_000,
  });
  await page.getByText("p95 of Observations Latency").first().waitFor();
  await skeletonsGone(page);
  await page.waitForTimeout(600);
});
await page.waitForTimeout(2600);

await glideTo(1000, 640, 800);
await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(`${base}/alerts`);
  await alertsLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
