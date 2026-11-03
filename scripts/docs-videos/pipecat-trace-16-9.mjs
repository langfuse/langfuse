// Docs: /integrations/frameworks/pipecat.
// A Pipecat voice-agent call: each turn's speech-to-text, LLM and
// text-to-speech steps in the trace tree, one LLM call's messages, then the
// same call on the timeline.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// links[16] is the Pipecat call (see the scenario's link order).
const traceUrl = links[16];

const scene = await openScene("pipecat-trace-16-9");
const { page, glideTo, glideClick, wide } = scene;

const treeTab = page.getByRole("tab", { name: "Tree" });
const timelineTab = page.getByRole("tab", { name: "Timeline" });
const row = (name, n = 0) => page.getByText(name, { exact: true }).nth(n);
const traceLoaded = async () => {
  await treeTab.waitFor({ timeout: 60_000 });
  await row("tts", 2).waitFor();
  await skeletonsGone(page);
};

await page.goto(traceUrl);
await traceLoaded();
// Visit the timeline once so its first render is not on camera.
await timelineTab.click();
await page.waitForTimeout(1500);
await treeTab.click();
await page.goto(traceUrl);
await traceLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 600);

await scene.record();
await page.waitForTimeout(900);
wide();
// The second turn's LLM call: the conversation so far, and the reply.
await glideClick(row("llm", 1), 1000, { x: 0.3, y: 0.5 });
await scene.cut(async () => {
  await page.getByText("It's A as in apple").first().waitFor();
  await skeletonsGone(page);
});
await page.waitForTimeout(1800);
await glideClick(row("tts", 1), 700, { x: 0.3, y: 0.5 });
await scene.cut(() => skeletonsGone(page));
await page.waitForTimeout(1400);

// The whole call on the timeline: three turns of stt > llm > tts.
await glideClick(timelineTab, 900, { x: 0.5, y: 0.5 });
await page.waitForTimeout(2600);
await glideTo(700, 520, 900);
await page.waitForTimeout(1400);

await glideClick(treeTab, 900, { x: 0.5, y: 0.5 });
await page.waitForTimeout(500);
await glideTo(1000, 600, 800);
await scene.cut(async () => {
  await page.goto(traceUrl);
  await traceLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
