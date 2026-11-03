// Docs: /docs/observability/features/environments.
// Narrows the Home dashboard to production with the environment filter,
// then shows only staging in the tracing table from the filter sidebar.
import { openScene, seed } from "./lib.mjs";
import { clearSidebarFilters, facetOnly } from "./sidebar-helpers.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
const base = "http://localhost:3000/project/docs-demo";

const scene = await openScene("environments");
const { page, glideTo, glideClick, wide } = scene;

const envButton = page.getByRole("button", { name: /^Env/ });
const homeLoaded = async () => {
  await envButton.waitFor({ timeout: 60_000 });
  await page.getByText("Total traces tracked").waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
  await page.waitForTimeout(800);
};
const tableLoaded = async () => {
  await page.getByText("Start Time").first().waitFor({ timeout: 60_000 });
  await skeletonsGone(page, 60_000);
};
// No environment selected means all of them.
const clearEnvs = async () => {
  await envButton.click();
  const clear = page.getByRole("option", { name: "Clear filters" });
  await clear.waitFor();
  if (await clear.isEnabled()) await clear.click();
  await page.keyboard.press("Escape");
};
const reset = async () => {
  await page.goto(`${base}/observations`);
  await tableLoaded();
  await clearSidebarFilters(page);
  await page.goto(base);
  await homeLoaded();
  await clearEnvs();
  await homeLoaded();
};

// Compile both routes once.
await page.goto(`${base}/observations`);
await tableLoaded();
await reset();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1000);
wide();

await glideClick(envButton, 900, { x: 0.5, y: 0.5 });
const list = page.getByRole("listbox", { name: "Suggestions" });
await list.waitFor();
await page.waitForTimeout(700);
await glideClick(
  list.getByRole("option", { name: "production", exact: true }),
  600,
  { x: 0.2, y: 0.5 },
);
// The dashboard refetches on every change; skip the loading state.
await scene.cut(async () => {
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await homeLoaded();
});
await page.waitForTimeout(2200);

// The same split in the tracing table.
await glideClick(page.getByRole("link", { name: "Tracing" }), 900);
await scene.cut(tableLoaded);
await page.waitForTimeout(1000);
await facetOnly(scene, "Environment", "staging");
await scene.cut(async () => {
  await page.waitForTimeout(700);
  await skeletonsGone(page, 60_000);
});
await page.waitForTimeout(2400);

await glideTo(1000, 640, 800);
await scene.cut(async () => {
  await reset();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
