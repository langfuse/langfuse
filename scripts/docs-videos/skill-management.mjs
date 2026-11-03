// Docs: /docs/skill-management/get-started.
// Creates a refund-policy skill from the empty Skills page, publishes it as
// version 1, then edits SKILL.md and publishes version 2 with a version
// note. docs-demo-project deletes the skill again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
const base = "http://localhost:3000/project/docs-demo/skills";
const SKILL_HEAD = `---
name: refund-policy
description: Decide whether a refund request is within Acme's policy and draft the reply.
---

# Refund policy

`;
const SKILL_RULES =
  "- Hardware: full refund within 30 days of delivery.\n- Subscriptions: prorated refund for the unused months.\n- Always quote the order number in the reply.\n";

const scene = await openScene("skill-management");
const { page, glideTo, glideClick, wide } = scene;

const editor = page.locator(".cm-content[role=textbox]").last();
const emptyLoaded = async () => {
  await page.getByText("Get Started with Skills").waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
};
/** Viewport rect of `text` inside the editor. */
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
const publish = async (note) => {
  await glideClick(page.getByRole("button", { name: "Publish" }), 900);
  const dialog = page.getByRole("dialog").last();
  const noteBox = dialog.getByRole("textbox", { name: "Version note" });
  await noteBox.waitFor();
  await page.waitForTimeout(700);
  await glideClick(noteBox, 700, { x: 0.2, y: 0.5 });
  await page.keyboard.type(note, { delay: 45 });
  // Let the file diff read for a moment.
  await page.waitForTimeout(1600);
  await glideClick(
    dialog.getByRole("button", { name: /^(Create skill|Create version)$/ }),
    800,
  );
};

// Compile the editor route once.
await page.goto(`${base}/new`);
await editor.waitFor({ timeout: 60_000 });
await page.goto(base);
await emptyLoaded();
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(
  page.getByRole("main").getByRole("link", { name: "New skill" }),
  1000,
);
await scene.cut(async () => {
  await editor.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
});
await page.waitForTimeout(800);

// Replace the template with the policy.
const tb = await editor.boundingBox();
await glideClick(editor, 900, { x: 0.3, y: 0.15 });
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.insertText(SKILL_HEAD);
await page.waitForTimeout(400);
await page.keyboard.type(SKILL_RULES, { delay: 22 });
await page.waitForTimeout(900);
await publish("First version of the refund rules");
await scene.cut(async () => {
  await page
    .getByText("First version of the refund rules")
    .first()
    .waitFor({ timeout: 30_000 });
  await skeletonsGone(page);
  await page.waitForTimeout(600);
});
await page.waitForTimeout(1800);

// Version 2: extend the hardware window. The success toast covers Edit.
await scene.cut(async () => {
  await page
    .locator("[data-sonner-toast]")
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .catch(() => {});
});
await glideClick(page.getByRole("button", { name: "Edit", exact: true }), 900);
const raw = page.getByRole("tab", { name: "Raw" });
await raw.waitFor({ timeout: 30_000 });
if ((await raw.getAttribute("aria-selected")) !== "true") {
  await page.waitForTimeout(500);
  await glideClick(raw, 700);
}
await scene.cut(async () => {
  await editor.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
});
await page.waitForTimeout(600);
const r = await editorRect("30 days");
if (!r) throw new Error("30 days not found in the editor");
await glideTo(r.x + 1, r.y + r.h / 2, 900);
await page.mouse.down();
await glideTo(r.x + r.w - 1, r.y + r.h / 2, 500);
await page.mouse.up();
await page.waitForTimeout(400);
await page.keyboard.type("45 days", { delay: 80 });
await page.waitForTimeout(900);
await publish("Hardware refunds now 45 days");
await scene.cut(async () => {
  await page
    .getByText("Hardware refunds now 45 days")
    .first()
    .waitFor({ timeout: 30_000 });
  await skeletonsGone(page);
  await page.waitForTimeout(600);
});
await page.waitForTimeout(2600);

await glideTo(tb.x + 300, tb.y + 300, 800);
await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(base);
  await emptyLoaded();
  await page.waitForTimeout(400);
});
await glideTo(1000, 640, 800);
await page.waitForTimeout(900);
await scene.finish();
