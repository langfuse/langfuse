// Docs: /docs/prompt-management/features/prompt-version-control
// ("Prompt Diffs"). Compares an older version of a chat prompt with the
// selected latest version in the diff dialog.
import { openScene, seed } from "./lib.mjs";

const { links } = seed("docs-demo-prompts", ["--project", "docs-demo"]);
const promptsUrl = links[0];

const scene = await openScene("prompt-changes");
const { page, glideTo, glideClick, focus, wide } = scene;

// An explicit version selects it, which enables the per-row compare buttons.
await page.goto(`${promptsUrl}/support-reply?version=5`);
await page.getByText("Make replies friendlier").waitFor();
await page.waitForTimeout(1200);
await scene.placeCursor(1180, 640);

// Rows in order #5 (selected, no button), #4, #3, #2, #1.
const compareV2 = page
  .getByRole("button", { name: "Compare with selected prompt" })
  .nth(2);
const history = { x: 0, y: 128, width: 960, height: 540 };

await scene.record();
await page.waitForTimeout(1000);
wide();
const row = await page.getByText("Make replies friendlier").boundingBox();
await glideTo(row.x + row.width + 60, row.y + row.height / 2, 900);
focus(history, 1.6);
await page.waitForTimeout(500);
await glideClick(compareV2, 450);
const dialog = page.getByRole("dialog");
await dialog.getByText("Changes v2").waitFor();
await glideTo(1180, 640, 700);
wide();
await page.waitForTimeout(3200);
// The footer button, not the corner X (both are named "Close").
const closeButtons = await dialog
  .getByRole("button", { name: "Close", exact: true })
  .all();
const boxes = await Promise.all(closeButtons.map((b) => b.boundingBox()));
const footerClose =
  closeButtons[boxes.indexOf(boxes.toSorted((a, b) => b.y - a.y)[0])];
await glideClick(footerClose, 700, {
  x: 0.25,
  y: 0.5,
});
await dialog.waitFor({ state: "hidden" });
await page.waitForTimeout(400);
// The screencast only emits on paint; nudge one so the faded-out dialog's
// last frame is not held to the end.
await page.evaluate(() => {
  document.activeElement?.blur();
  document.body.style.opacity = "0.999";
  requestAnimationFrame(() => (document.body.style.opacity = ""));
});
await glideTo(1180, 640, 800);
await page.waitForTimeout(1000);
await scene.finish();
