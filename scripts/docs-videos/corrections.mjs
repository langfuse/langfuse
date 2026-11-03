// Docs: /docs/observability/features/corrections.
// The support bot promised the pickup at the customer's old address after
// they moved the delivery. "Correct output" opens an editor prefilled with
// the output; the fix saves as you type and is shown as a diff.
// The take deletes the correction again at the end.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// links[14] is turn 3 of the support session: the pickup question.
const traceUrl = links[14];
const WRONG = "your original address";
const RIGHT = "1840 Harbor Rd, Oakland";

const scene = await openScene("corrections");
const { page, glideTo, glideClick, wide } = scene;

const formatted = page.getByRole("tab", { name: "Formatted" });
const correct = page.getByRole("button", { name: "Correct output" });
const editor = page.locator(".cm-content[role=textbox]").last();
const traceLoaded = async () => {
  await formatted.waitFor({ timeout: 60_000 });
  await page.getByText("Will the courier still pick up").first().waitFor();
  await skeletonsGone(page);
  await page.waitForTimeout(500);
};
const removeCorrection = async () => {
  const del = page.getByRole("button", { name: "Delete corrected output" });
  if (await del.isVisible()) {
    await del.click();
    const confirm = page.getByRole("button", { name: /^(Delete|Confirm)$/ });
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirm.click();
    }
    await page.waitForTimeout(1500);
  }
};
/** Viewport rect of `text` inside the correction editor. */
const editorRect = (text) =>
  editor.evaluate((root, needle) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(needle);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + needle.length);
      const b = range.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    return null;
  }, text);

await page.goto(traceUrl);
await traceLoaded();
if ((await formatted.getAttribute("aria-selected")) !== "true") {
  await formatted.click();
}
await removeCorrection();
await page.goto(traceUrl);
await traceLoaded();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 700);

await scene.record();
await page.waitForTimeout(1200);
wide();

// The pencil next to Output.
await glideClick(correct, 1000);
await editor.waitFor();
await page.waitForTimeout(1000);

// Replace the wrong address in the prefilled output.
const r = await editorRect(WRONG);
const y = r.y + r.h / 2;
await glideTo(r.x + 1, y, 900);
await page.mouse.down();
await glideTo(r.x + r.w - 1, y, 700);
await page.mouse.up();
await page.waitForTimeout(500);
await page.keyboard.type(RIGHT, { delay: 55 });
await page.waitForTimeout(900);

// The correction saves as you type.
await page.getByText("Saved", { exact: true }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);
await glideClick(
  page.getByRole("button", {
    name: "View diff between original and corrected output",
  }),
  900,
);
await page.waitForTimeout(3000);

await glideTo(1000, 700, 800);
await scene.cut(async () => {
  await page.goto(traceUrl);
  await traceLoaded();
  await removeCorrection();
  // Deletes reach ClickHouse asynchronously; reload until it is gone.
  for (let i = 0; i < 10; i++) {
    await page.goto(traceUrl);
    await traceLoaded();
    if (!(await page.getByText("Corrected Output").isVisible())) break;
    await removeCorrection();
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
