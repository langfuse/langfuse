// Docs: /docs/prompt-management/features/prompt-version-control
// ("Versions & Labels"). Promotes the latest version of a chat prompt to
// production via its labels, then rolls production back to the previous
// version so the take ends on the frame it started from.
import { openScene, seed } from "./lib.mjs";

// The seed resets every version's labels (production on #9).
const { links } = seed("docs-demo-prompts", ["--project", "docs-demo"]);
const promptUrl = links.find((l) => l.endsWith("/qa-answer-with-context-chat"));

const scene = await openScene("deploy-prompt");
const { page, glideTo, glideClick, focus, wide } = scene;

await page.goto(promptUrl);
await page.getByText("Link cited article").first().waitFor();
await page.waitForTimeout(1200);
await scene.placeCursor(1180, 640);

const addLabel = page.getByText("Add label", { exact: true });
const popover = page.locator("[data-radix-popper-content-wrapper]");
// The checkbox sits at the row's left edge; click it, not the label text.
const onCheckbox = { x: 0.04, y: 0.5 };
const productionItem = popover.getByRole("button", {
  name: "production",
  exact: true,
});
const promote = page.getByRole("button", {
  name: "Save and promote to production",
});
const interaction = { x: 59, y: 128, width: 1182, height: 664 };
const zoom = 1.3;

async function promoteSelectedVersion() {
  await glideClick(addLabel, 600, { x: 0.15, y: 0.5 });
  await productionItem.waitFor();
  await page.waitForTimeout(500);
  await glideClick(productionItem, 550, onCheckbox);
  await promote.waitFor();
  await page.waitForTimeout(500);
  await glideClick(promote, 600, { x: 0.05, y: 0.5 });
  // Drift off the button while the mutation runs.
  await glideTo(640, 560, 900);
  // The dev server takes seconds to save; skip the wait in the video.
  await scene.cut(() => popover.waitFor({ state: "hidden" }));
}

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideTo(820, 300, 750);
focus(interaction, zoom);
await promoteSelectedVersion();
await glideTo(560, 360, 500);
await page.waitForTimeout(1200);

// Roll back: production goes back to #9.
await glideClick(page.getByText("Cite source article"), 700, {
  x: 0.85,
  y: 0.5,
});
await page.getByText("Cite source article").nth(1).waitFor();
await page.waitForTimeout(400);
await promoteSelectedVersion();
await page.waitForTimeout(900);

// Back to the latest version, as at the start. The list re-renders after
// the label mutation and can swallow a click, so confirm and retry.
const latestTitle = page.getByText("Link cited article");
for (
  let attempt = 0;
  attempt < 3 && (await latestTitle.count()) < 2;
  attempt++
) {
  await glideClick(latestTitle.first(), attempt ? 200 : 700, {
    x: 0.85,
    y: 0.5,
  });
  await page.waitForTimeout(700);
}
if ((await latestTitle.count()) < 2) throw new Error("latest not selected");
await page.evaluate(() => document.activeElement?.blur());
await page.waitForTimeout(600);
focus(interaction, zoom);
await glideTo(1180, 640, 1000);
wide();
await page.waitForTimeout(1000);
await scene.finish();
