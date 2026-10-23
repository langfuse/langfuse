// Docs: /docs/prompt-management/features/config. Creates a new version of a
// chat prompt with a changed model config, then opens its Config tab.
// The seed removes versions added by earlier takes.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-prompts", ["--project", "docs-demo"]);
const promptUrl = `${links[0]}/support-reply`;

const scene = await openScene("2025-12-16-prompt-config");
const { page, glideTo, glideClick, focus, wide } = scene;

// Warm the form route so the take does not wait on a dev-server compile.
await page.goto(promptUrl);
await page.getByRole("link", { name: "New version" }).click();
await page.locator(".cm-content").last().waitFor();
await page.goto(promptUrl);
await page.getByText("Pass customer name").first().waitFor();
await page.waitForTimeout(1200);
await scene.placeCursor(1180, 640);

/** Scrolls the page in small wheel steps so the motion reads as a scroll. */
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
const newVersion = page.getByRole("link", { name: "New version" });
await glideClick(newVersion, 900, { x: 0.15, y: 0.5 });
const config = page.locator(".cm-content").last();
await scene.cut(async () => {
  await page.waitForURL(/prompts\/new/);
  await config.waitFor();
  await page.waitForTimeout(800);
});
wide();

const configBox = await config.boundingBox();
const editorArea = {
  x: configBox.x,
  y: configBox.y - 70,
  width: 700,
  height: 200,
};
await glideClick(config, 800, { x: 0.3, y: 0.5 });
focus(editorArea, 1.35);
await page.keyboard.press("ControlOrMeta+a");
await page.keyboard.type('{"model": "gpt-4.1", "temperature": 0}', {
  delay: 25,
});
await page.waitForTimeout(900);

// Zoom back out, then down to the save button.
await glideTo(900, 560, 700);
wide();
await smoothScroll(700);
await page.waitForTimeout(250);
const save = page.getByRole("button", { name: "Save new prompt version" });
await glideClick(save, 650, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  await page.waitForURL((url) => !url.pathname.endsWith("/new"));
  await page.getByText("# 6", { exact: true }).first().waitFor();
  await page.waitForTimeout(300);
});
wide();

// The new version's Config tab.
const configTab = page.getByRole("tab", { name: "Config" });
await glideClick(configTab, 800);
await scene.cut(() => page.getByText("2 Items").first().waitFor());
// The screencast only emits on paint; nudge one so the Config view is
// captured right after the cut.
await page.evaluate(() => {
  document.activeElement?.blur();
  document.body.style.opacity = "0.999";
  requestAnimationFrame(() => (document.body.style.opacity = ""));
});
await page.waitForTimeout(400);
const tabBox = await configTab.boundingBox();
focus({ x: tabBox.x - 60, y: tabBox.y - 60, width: 700, height: 300 }, 1.35);
await glideTo(1180, 640, 900);
await page.waitForTimeout(1600);
wide();
await page.waitForTimeout(1000);
await scene.finish();
