// Docs: /docs/observability/features/sessions.
// The session view reads a multi-trace chat as one conversation: jump to a
// turn from the sidebar, search the session, then open one turn's trace.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-project");
seed("docs-demo-traces", ["--project", "docs-demo"]);
const sessionUrl =
  "http://localhost:3000/project/docs-demo/sessions/chat-7f3a9c2e41";

const scene = await openScene("session-view");
const { page, glideTo, glideClick, wide } = scene;

const sidebar = page.getByRole("complementary", {
  name: "Session messages and tools",
});
const search = page.getByPlaceholder("Search session");
const sessionLoaded = async () => {
  await search.waitFor({ timeout: 60_000 });
  await page.getByText("Order #A-21007").first().waitFor();
  await skeletonsGone(page);
};

await page.goto(sessionUrl);
await sessionLoaded();
const banner = page.getByRole("button", {
  name: "Dismiss redesigned sessions view banner",
});
if (await banner.isVisible()) await banner.click();
await page.goto(sessionUrl);
await sessionLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(1200);
wide();

// Jump to the last turn from the sidebar.
const turn4 = sidebar.getByRole("button", { name: "User message" }).nth(3);
await glideClick(turn4, 1000, { x: 0.25, y: 0.5 });
await page.waitForTimeout(1800);

// Search the whole session.
await glideClick(search, 900, { x: 0.3, y: 0.5 });
await page.keyboard.type("pickup", { delay: 70 });
await page.waitForTimeout(1300);
const hit = sidebar.getByText("of the damaged unit is still booked");
await glideClick(hit, 800, { x: 0.3, y: 0.5 });
await page.waitForTimeout(1800);

// Open the turn's trace in the peek panel.
const turn3 = page
  .getByRole("main")
  .getByRole("button", { name: "support-chat", exact: true })
  .nth(2);
await glideClick(turn3, 900, { x: 0.5, y: 0.5 });
await scene.cut(async () => {
  await page.getByText("Will the courier still pick up").last().waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(2400);

await glideTo(1000, 600, 800);
await scene.cut(async () => {
  await page.goto(sessionUrl);
  await sessionLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
