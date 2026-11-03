// Docs: /docs/observability/features/web-callouts.
// Adds a callout endpoint in Project Settings > Integrations > Web Callouts,
// then fires it from the options menu of the trace detail header and shows the success toast.
// Needs an endpoint that answers 200 at CALLOUT_URL and the web server
// started with LANGFUSE_WEBHOOK_WHITELISTED_HOST=support.localhost (the
// backend refuses local addresses otherwise). docs-demo-project deletes the
// endpoint again.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

const CALLOUT_URL =
  process.env.CALLOUT_URL ?? "http://support.localhost:4567/langfuse";

seed("docs-demo-project");
const { links } = seed("docs-demo-traces", ["--project", "docs-demo"]);
// links[14] is turn 3 of the support session: the pickup question.
const traceUrl = links[14];
const settingsUrl =
  "http://localhost:3000/project/docs-demo/settings/integrations/web-callouts";

const scene = await openScene("web-callouts");
const { page, glideTo, glideClick, wide } = scene;

const addEndpoint = page.getByRole("button", { name: "Add endpoint" });
const settingsLoaded = async () => {
  await addEndpoint.waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
};
const fill = async (name, text) => {
  const box = page.getByRole("dialog").getByRole("textbox", { name });
  await glideClick(box, 800, { x: 0.3, y: 0.5 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text, { delay: 45 });
  await page.waitForTimeout(400);
};

// Compile the trace route once.
await page.goto(traceUrl);
await page.getByText("Will the courier still pick up").first().waitFor({
  timeout: 60_000,
});
await page.goto(settingsUrl);
await settingsLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 640);

await scene.record();
await page.waitForTimeout(1000);
wide();
await glideClick(addEndpoint, 1000);
await page.getByRole("dialog").waitFor();
await page.waitForTimeout(700);
await fill("Name", "Support Desk");
await fill("Endpoint URL", CALLOUT_URL);
await fill("Toast message", "Ticket opened in Support Desk");
await page.waitForTimeout(500);
await glideClick(page.getByRole("button", { name: "Save endpoint" }), 900);
await scene.cut(async () => {
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 30_000 });
  await page.getByText("Support Desk").first().waitFor();
  await page.waitForTimeout(500);
});
await page.waitForTimeout(1600);

// Fire it from a trace.
await scene.cut(async () => {
  await page.goto(traceUrl);
  await page.getByText("Will the courier still pick up").first().waitFor({
    timeout: 60_000,
  });
  await skeletonsGone(page);
  await page.waitForTimeout(600);
});
await page.waitForTimeout(1000);
// The callout is in the options menu of the trace detail header.
await glideClick(page.getByRole("button", { name: "Options" }).last(), 1000);
const action = page.getByRole("menuitem", { name: /Support Desk/ });
await action.waitFor();
await page.waitForTimeout(700);
await glideClick(action, 700, { x: 0.3, y: 0.5 });
await page
  .getByText("Ticket opened in Support Desk")
  .first()
  .waitFor({ timeout: 30_000 });
await page.waitForTimeout(2600);

await glideTo(1000, 640, 800);
await scene.cut(async () => {
  seed("docs-demo-project");
  await page.goto(settingsUrl);
  await settingsLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
