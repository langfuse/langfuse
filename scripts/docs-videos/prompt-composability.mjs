// Docs: /docs/prompt-management/features/composability. Adds an inline
// reference to the `guidelines` text prompt to a new version of a chat
// prompt, saves it, and shows the resolved prompt. Stays wide so the whole
// form is readable. The seed removes versions added by earlier takes.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-prompts", ["--project", "docs-demo"]);
const promptUrl = `${links[0]}/qa-answer-with-context-chat`;

const scene = await openScene("prompt-composability");
const { page, glideTo, glideClick, wide } = scene;

// Warm the form route so the take does not wait on a dev-server compile.
await page.goto(promptUrl);
await page.getByRole("link", { name: "New version" }).click();
await page.locator(".cm-content").last().waitFor();
await page.goto(promptUrl);
await page.getByText("Link cited article").first().waitFor();
await page.waitForTimeout(1200);
await scene.placeCursor(1180, 640);

/**
 * Scrolls the page's scroll container with the browser's own smooth
 * scrolling: one call, so app re-renders cannot stretch it out.
 */
async function smoothScroll(dy) {
  await page.evaluate((dy) => {
    let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (
      el &&
      !(
        el.scrollHeight > el.clientHeight + 10 &&
        /(auto|scroll)/.test(getComputedStyle(el).overflowY)
      )
    ) {
      el = el.parentElement;
    }
    (el ?? document.scrollingElement).scrollBy({ top: dy, behavior: "smooth" });
  }, dy);
  await page.waitForTimeout(700);
}

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(page.getByRole("link", { name: "New version" }), 750, {
  x: 0.15,
  y: 0.5,
});
const userMessage = page.locator(".cm-content").nth(1);
await scene.cut(async () => {
  await page.waitForURL(/prompts\/new/);
  await userMessage.waitFor();
  await page.waitForTimeout(600);
});
wide();

const lastLine = userMessage.getByText("Answer in at most three sentences.");

await glideClick(page.getByText("Add prompt reference"), 700, {
  x: 0.08,
  y: 0.5,
});
const dialog = page.getByRole("dialog");
// Server/render waits are cut from the take; the visible holds stay.
await scene.cut(() => dialog.waitFor());
await page.waitForTimeout(250);
// Options are radio rows; click their radio, not the label.
const onRadio = { x: -0.12, y: 0.5 };
await glideClick(dialog.getByRole("combobox").first(), 600, { x: 0.2, y: 0.5 });
await scene.cut(() =>
  page.getByText("guidelines", { exact: true }).last().waitFor(),
);
await page.waitForTimeout(250);
await glideClick(
  page.getByText("guidelines", { exact: true }).last(),
  600,
  onRadio,
);
await scene.cut(() => dialog.getByText("Reference by").waitFor());
await page.waitForTimeout(250);
await glideClick(dialog.getByRole("combobox").nth(2), 600, { x: 0.2, y: 0.5 });
await scene.cut(() =>
  page.getByText("production", { exact: true }).last().waitFor(),
);
await page.waitForTimeout(250);
await glideClick(page.getByText("production", { exact: true }).last(), 600, {
  x: -0.1,
  y: 0.5,
});
await scene.cut(() => dialog.getByText("Tag preview").waitFor());
await page.waitForTimeout(500);
await glideClick(dialog.getByRole("button", { name: "Copy and close" }), 600, {
  x: 0.15,
  y: 0.5,
});
await scene.cut(() => dialog.waitFor({ state: "hidden" }));
// Closing the dialog moves focus to its trigger: click back into the message
// and paste the tag on a new paragraph.
await glideClick(lastLine, 650, { x: 0.25, y: 0.5 });
await page.keyboard.press("ControlOrMeta+End");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
await page.keyboard.press("ControlOrMeta+v");
await scene.cut(() =>
  page.getByText("@@@langfusePrompt:name=guidelines").first().waitFor(),
);
await glideTo(980, 575, 500);
await page.waitForTimeout(500);

// Save the version.
wide();
await smoothScroll(900);
await page.waitForTimeout(250);
const save = page.getByRole("button", { name: "Save new prompt version" });
await glideClick(save, 700, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  await page.waitForURL((url) => !url.pathname.endsWith("/new"));
  await page.getByText("# 13", { exact: true }).first().waitFor();
  await page.waitForTimeout(250);
});
wide();

// The reference renders as a chip; the resolved view inlines the guidelines.
const resolved = page.getByText("Resolved prompt", { exact: true });
await glideClick(resolved, 750, { x: 0.12, y: 0.5 });
await page.getByText("Keep answers under 120 words.").first().waitFor();
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1000, 640, 700);
await page.waitForTimeout(1500);
wide();
await page.waitForTimeout(800);
await scene.finish();
