// Docs: /docs landing page, Observability > Sessions tab.
// From one turn of a support chat, opens its session: the whole
// conversation in one view, then jumps to a later turn from the list.
import { openScene, seed } from "./lib.mjs";
import { smoothScroll, skeletonsGone } from "./scroll-helpers.mjs";

const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// links[12..15] are the four turns of the support-chat session.
const turnUrl = links[13];

const scene = await openScene("overview-sessions");
const { page, glideTo, glideClick, wide } = scene;

const sessionLink = page
  .locator('a[href*="/sessions/chat-7f3a9c2e41"]')
  .first();
const sessionLoaded = async () => {
  await page.getByText("Perfect, thanks for the quick help!").first().waitFor({
    timeout: 60_000,
  });
  await skeletonsGone(page);
};
const turnLoaded = async () => {
  await sessionLink.waitFor({ timeout: 60_000 });
  await page.getByText("update-shipping-address").first().waitFor();
  await skeletonsGone(page);
};

// Open the session once to compile the route and dismiss the one-time
// "redesigned session view" banner, then start on the trace.
await page.goto(turnUrl);
await turnLoaded();
await sessionLink.click();
await sessionLoaded();
const dismiss = page.getByRole("button", {
  name: "Dismiss redesigned sessions view banner",
});
if (await dismiss.isVisible()) {
  await dismiss.click();
  await dismiss.waitFor({ state: "hidden" });
}
await page.goto(turnUrl);
await turnLoaded();
await page.waitForTimeout(1200);
await scene.placeCursor(1000, 560);

await scene.record();
await page.waitForTimeout(900);
wide();
// The session badge in the trace header.
await glideClick(sessionLink, 1000, { x: 0.5, y: 0.5 });
await scene.cut(sessionLoaded);
await page.waitForTimeout(1600);

// Read down the conversation.
await glideTo(1000, 520, 700);
await smoothScroll(page, 420, { x: 1000, y: 520 });
await page.waitForTimeout(1400);

// Jump to the last turn from the list on the left.
const lastTurn = page.getByText("support-chat", { exact: true }).nth(3);
await glideClick(lastTurn, 800, { x: 0.3, y: 0.5 });
await page.waitForTimeout(2200);

// Back to the trace for a seamless loop.
await glideTo(1000, 560, 800);
await scene.cut(async () => {
  await page.goBack();
  await turnLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
