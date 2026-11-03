// Docs: /docs landing page, Observability > Users tab.
// The Users list with trace counts, tokens and cost per customer, then one
// customer's traces and scores.
import { openScene, seed } from "./lib.mjs";
import { skeletonsGone } from "./scroll-helpers.mjs";

seed("docs-demo-traffic", [
  "--project",
  "docs-demo",
  "--id-prefix",
  "5f1c0e7a",
]);
seed("docs-demo-traces", ["--project", "docs-demo"]);
const usersUrl = "http://localhost:3000/project/docs-demo/users";
const USER = "cust-2115";

const scene = await openScene("overview-users");
const { page, glideTo, glideClick, wide } = scene;

const userLink = page.getByRole("link", { name: USER, exact: true });
const listLoaded = async () => {
  await userLink.waitFor({ timeout: 60_000 });
  await skeletonsGone(page);
};
// The user page's tabs are buttons; the sidebar's Sessions and Scores
// entries are links, so they do not match.
const tab = (name) => page.getByRole("button", { name, exact: true }).first();
const userLoaded = async () => {
  await tab("Sessions").waitFor({ timeout: 60_000 });
  await page.getByText("Total Cost:").first().waitFor();
  await skeletonsGone(page);
};

// Visit the user page once so its route is compiled.
await page.goto(usersUrl);
await listLoaded();
await userLink.click();
await userLoaded();
for (const name of ["Scores", "Traces"]) {
  await tab(name).click();
  await page.waitForTimeout(1500);
}
await page.goto(usersUrl);
await listLoaded();
await page.waitForTimeout(1000);
await scene.placeCursor(1000, 620);

await scene.record();
await page.waitForTimeout(1200);
wide();
await glideClick(userLink, 1000, { x: 0.3, y: 0.5 });
await scene.cut(userLoaded);
await page.waitForTimeout(1800);

await glideClick(tab("Scores"), 750, { x: 0.5, y: 0.5 });
await scene.cut(async () => {
  await page.waitForTimeout(400);
  await skeletonsGone(page);
});
await page.waitForTimeout(2600);

// Back to the list for a seamless loop.
await glideTo(1000, 620, 800);
await scene.cut(async () => {
  await page.goto(usersUrl);
  await listLoaded();
  await page.waitForTimeout(400);
});
await page.waitForTimeout(900);
await scene.finish();
