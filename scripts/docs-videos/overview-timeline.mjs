// Docs: /docs landing page, Observability > Timeline tab.
// A support-copilot agent trace switched from the tree to the timeline,
// where the slow steps stand out; then one of them is opened.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

// support-agent anchors its trace to today, so a prefix reused on another
// day would leave yesterday's rows under the same id and stretch the trace
// over 24 hours. Derive the prefix from the date.
const day = Math.floor(Date.now() / 86_400_000)
  .toString(16)
  .padStart(8, "0");
const { links } = seed("support-agent", [
  "--project",
  "docs-demo",
  "--v4",
  "--id-prefix",
  `0199c4e2${day}`,
]);
const scene = await openScene("overview-timeline");
const { page, glideTo, glideClick, wide } = scene;

const treeTab = page.getByRole("tab", { name: "Tree" });
const timelineTab = page.getByRole("tab", { name: "Timeline" });
const traceLoaded = async () => {
  await treeTab.waitFor({ timeout: 60_000 });
  await page.getByText("stripe.create-refund").first().waitFor();
  await skeletonsGone(page);
};

await page.goto(links[0]);
await traceLoaded();
// Visit the timeline once so its first render is not on camera.
await timelineTab.click();
await page.waitForTimeout(1500);
await treeTab.click();
await page.waitForTimeout(800);
await page.goto(links[0]);
await traceLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(900);
wide();
await glideClick(timelineTab, 1000, { x: 0.5, y: 0.5 });
await page.waitForTimeout(1800);

// Timeline rows show each step's duration: rest on the refund call, then
// open the last llm.chat call.
const refund = page.getByText(/^952ms/).first();
await glideTo(
  ...(await refund
    .boundingBox()
    .then((b) => [b.x + b.width / 2, b.y + b.height / 2])),
  900,
);
await page.waitForTimeout(900);
const llmCall = page.getByText(/^1\.85s/).first();
await glideClick(llmCall, 800, { x: 0.3, y: 0.5 });
await scene.cut(() => skeletonsGone(page));
await page.waitForTimeout(2400);

// Back to the tree, as at the start.
await glideClick(treeTab, 900, { x: 0.5, y: 0.5 });
await page.waitForTimeout(600);
await glideTo(1000, 600, 800);
await scene.cut(async () => {
  await page.goto(links[0]);
  await traceLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
