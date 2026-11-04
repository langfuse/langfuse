// Docs: /docs/observability/features/comments.
// Selects a phrase in an observation's output (JSON view), comments on it
// with an @mention of a teammate, and reacts to the comment.
// docs-demo-project deletes the comment again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// links[0] is the RAG answer about Fleet API rate limits.
const traceUrl = links[0];
const PHRASE = "600 requests per minute";

const scene = await openScene("inline-comments");
const { page, glideTo, glideClick, focus, wide } = scene;

const raw = page.getByRole("tab", { name: "Raw" });
const traceLoaded = async () => {
  await raw.waitFor({ timeout: 60_000 });
  await page.getByPlaceholder(/Search across all sections/).waitFor({
    timeout: 60_000,
  });
  await skeletonsGone(page);
  await page.waitForTimeout(600);
};
/** Viewport rect of the first occurrence of `text` inside the output JSON. */
const textRect = (text) =>
  page.evaluate((needle) => {
    const walker = document.createTreeWalker(
      document.querySelector("main"),
      NodeFilter.SHOW_TEXT,
    );
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

// The JSON view with "Optimized" on is where text can be commented on.
await page.goto(traceUrl);
await raw.waitFor({ timeout: 60_000 });
await raw.click();
const optimized = page.getByRole("switch").first();
await optimized.waitFor();
if ((await optimized.getAttribute("aria-checked")) !== "true") {
  await optimized.click();
}
await page.goto(traceUrl);
await traceLoaded();
await page.waitForTimeout(800);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1000);
wide();

// Drag across the phrase to select it, close enough to see the highlight.
const r = await textRect(PHRASE);
const y = r.y + r.h / 2;
await glideTo(r.x - 40, y + 30, 900);
focus({ x: r.x - 330, y: r.y - 160, width: 860, height: 484 }, 1.8);
await glideTo(r.x + 1, y, 700);
await page.mouse.down();
// glideTo lands the real pointer in one jump; step it so the drag selects.
const x0 = r.x + 1;
const x1 = r.x + r.w - 1;
await Promise.all([
  glideTo(x1, y, 1400),
  (async () => {
    for (let i = 1; i <= 20; i++) {
      await page.waitForTimeout(65);
      await page.mouse.move(x0 + ((x1 - x0) * i) / 20, y);
    }
  })(),
]);
await page.mouse.up();
if (!(await page.evaluate(() => String(getSelection())))) {
  throw new Error("Phrase not selected");
}
await page.waitForTimeout(1600);

const commentChip = page.getByRole("button", { name: "Comment" }).last();
await glideClick(commentChip, 700);
wide();
const composer = page.getByRole("textbox").last();
await composer.waitFor();
await page.waitForTimeout(800);
await page.keyboard.type("@Ma", { delay: 90 });
const maya = page.getByRole("option", { name: /Maya Chen/ });
await maya.waitFor();
await page.waitForTimeout(500);
await glideClick(maya, 700, { x: 0.3, y: 0.5 });
await page.waitForTimeout(400);
await page.keyboard.type(" is 600/min still our limit after the v2 change?", {
  delay: 45,
});
await page.waitForTimeout(700);
await glideClick(
  page.getByRole("button", { name: "Comment", exact: true }).last(),
  800,
);
await scene.cut(async () => {
  await page.getByText("is 600/min still our limit").first().waitFor();
  await page.waitForTimeout(500);
});
await page.waitForTimeout(1500);

// React to the comment.
const posted = page.getByText("is 600/min still our limit").first();
const pb = await posted.boundingBox();
await glideTo(pb.x + 60, pb.y + pb.height / 2, 700);
const react = page.locator("button:has(svg.lucide-smile-plus)").last();
await react.waitFor();
await page.waitForTimeout(400);
await glideClick(react, 600);
await page.getByPlaceholder("Search emoji...").waitFor();
await page.waitForTimeout(700);
const eyes = page.getByText("🤔", { exact: true }).last();
await glideClick(eyes, 600);
await page.waitForTimeout(2400);

await glideTo(1000, 640, 800);
await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(traceUrl);
  await traceLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
