// Docs: /docs/administration/rbac ("Organizations and projects").
// Opens the organization and then the project switcher in the breadcrumb.
import { openScene, seed } from "./lib.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const scene = await openScene("project_menu");
const { page, glideTo, glideClick, focus, wide } = scene;

await page.goto("http://localhost:3000/project/docs-demo/settings");
await page.getByText("Debug Information").waitFor();
await page.waitForTimeout(1500);
await scene.placeCursor(1000, 560);

const orgTrigger = page.getByText("Acme Corp", { exact: true }).first();
const projectTrigger = page
  .getByText("customer-support", { exact: true })
  .first();
const org = await orgTrigger.boundingBox();
const menuArea = { x: org.x - 70, y: 0, width: 820, height: 461 };

await scene.record();
await page.waitForTimeout(1000);
// Hold the wide frame before the camera moves in.
wide();
await glideTo(org.x + 120, org.y + 140, 900);
focus(menuArea, 1.85);
// Click on the chevron so the cursor does not cover the name.
const onChevron = async (locator) => {
  const box = await locator.boundingBox();
  return { x: 1 - 6 / box.width, y: 0.5 };
};
await glideClick(orgTrigger, 450, await onChevron(orgTrigger));
await page.getByText("Organizations", { exact: true }).waitFor();
await page.waitForTimeout(500);
// Hover over each organization on its right padding, away from the label.
for (const name of ["Seed Enterprise Org", "Langfuse Demo", "Seed Org"]) {
  const item = page.getByRole("menuitem").filter({ hasText: name });
  const box = await item.boundingBox();
  await glideTo(box.x + box.width - 34, box.y + box.height / 2, 380);
  await page.waitForTimeout(260);
}
await page.waitForTimeout(400);
// Close from the breadcrumb row, so no page row under the pointer lights up.
// Escape hands focus back to the trigger; drop it as it arrives so no focus
// ring flashes.
const closeMenu = async () => {
  const box = await projectTrigger.boundingBox();
  await glideTo(box.x - 24, box.y + box.height / 2, 450);
  await page.evaluate(() =>
    addEventListener("focusin", (e) => e.target.blur?.(), { once: true }),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
};
await closeMenu();
await glideClick(projectTrigger, 450, await onChevron(projectTrigger));
await page.getByText("Projects", { exact: true }).waitFor();
await page.waitForTimeout(500);
for (const name of ["research-assistant", "voice-agent"]) {
  const item = page.getByRole("menuitem").filter({ hasText: name });
  const box = await item.boundingBox();
  await glideTo(box.x + box.width - 34, box.y + box.height / 2, 380);
  await page.waitForTimeout(300);
}
await page.waitForTimeout(600);
await closeMenu();
focus(menuArea, 1.85);
await glideTo(1000, 560, 1000);
wide();
await page.waitForTimeout(1000);
await scene.finish();
