// Docs: /docs/evaluation/evaluation-methods/annotation-queues. Creates an
// "Error Analysis" queue with the First Pass score config, adds three
// support-chat traces (root observations) from the tracing table, and
// annotates the first item.
import { openScene, seed } from "./lib.mjs";

// Removes the "Error Analysis" queue and annotation scores from earlier takes.
seed("docs-demo-evals", ["--project", "docs-demo"]);
const scene = await openScene("2025-12-19-annotation-queues");
const { page, glideTo, glideClick, wide } = scene;
const project = "http://localhost:3000/project/docs-demo";
const tracesUrl = `${project}/traces?filter=isRootObservation;boolean;;=;true,name;stringOptions;;any+of;qa-chatbot`;

// Warm up the routes the take visits so the dev server has compiled them.
await page.goto(tracesUrl);
await page.locator("tbody tr").first().waitFor({ timeout: 90_000 });
await page.goto(`${project}/annotation-queues/docs-demo-queue-weekly-review`);
await page.waitForTimeout(3000);
await page.goto(
  `${project}/annotation-queues/docs-demo-queue-weekly-review/items`,
);
await page.waitForTimeout(4000);

await page.goto(`${project}/annotation-queues`);
await page.getByText("Weekly Quality Review").waitFor();
// The rail link opens the tracing table unfiltered; route it to the
// pre-filtered view (root spans of the demo chatbot) like a saved view.
await page.evaluate((url) => {
  addEventListener(
    "click",
    (e) => {
      const link = e.target instanceof Element && e.target.closest("a");
      if (link?.getAttribute("href")?.endsWith("/traces")) {
        e.preventDefault();
        e.stopPropagation();
        window.next.router.push(url);
      }
    },
    true,
  );
}, tracesUrl);
await page.waitForTimeout(1500);
await scene.placeCursor(1000, 560);
await page.waitForTimeout(300);

const onIcon = { x: 0.12, y: 0.5 };
// Pacing for a ~25 s take: shorter glides and holds, and the wait for each
// target (slow on a busy dev server) cut from the video.
const SPEED = 0.7;
const hold = (ms) => page.waitForTimeout(ms * SPEED);
async function click(locator, ms, at) {
  await scene.cut(() => locator.waitFor({ timeout: 60_000 }));
  await glideClick(locator, ms * SPEED, at);
}
const dialogArea = { x: 498, y: 120, width: 540, height: 600 };
const tableArea = { x: 300, y: 290, width: 880, height: 520 };

await scene.record();
await hold(1000);
wide();

// 1. Create the queue.
const newQueue = page.getByRole("button", { name: "New queue" });
await click(newQueue, 900, { x: 0.2, y: 0.5 });
const nameInput = page.getByRole("dialog").getByRole("textbox").first();
await scene.cut(() => nameInput.waitFor());
await hold(350);
await click(nameInput, 650, { x: 0.15, y: 0.5 });
await page.keyboard.type("Error Analysis", { delay: 35 });
await click(page.getByRole("button", { name: "Add score" }), 550, onIcon);
await hold(250);
await click(page.getByText("First Pass (Categorical)"), 500, {
  x: 0.06,
  y: 0.5,
});
await hold(700);
await click(page.getByRole("button", { name: "Create queue" }), 600, {
  x: 0.2,
  y: 0.5,
});
await scene.cut(() =>
  page.getByRole("link", { name: "Error Analysis" }).waitFor(),
);
wide();
await hold(500);

// 2. Add traces from the tracing table.
const tracingLink = page.locator("a[href$='/traces']").first();
await click(tracingLink, 800);
const rows = page.locator("tbody tr");
await scene.cut(() =>
  page.locator("tbody").getByText("MY INVOICE STILL SHOWS").waitFor(),
);
await hold(500);
for (let i = 0; i < 3; i++) {
  await click(rows.nth(i).getByRole("checkbox"), i === 0 ? 700 : 300);
  await hold(120);
}
await hold(300);
await click(
  page.getByRole("button", { name: "Add to Annotation Queue" }),
  650,
  onIcon,
);
const queueSelect = page.getByRole("dialog").getByRole("combobox");
await scene.cut(() => queueSelect.waitFor());
await hold(400);
await click(queueSelect, 550, { x: 0.1, y: 0.5 });
await hold(300);
await click(page.getByText("Error Analysis", { exact: true }).last(), 500, {
  x: 0.02,
  y: 0.5,
});
await hold(400);
await click(page.getByRole("button", { name: "Confirm" }), 550);
const toast = page.locator("[data-sonner-toast]");
await scene.cut(() => toast.waitFor());
wide();
await hold(200);

// 3. Open the queue from the toast and start processing.
const viewQueue = toast.getByRole("link", { name: /View queue/ });
const queueHref = await viewQueue.getAttribute("href").catch(() => null);
await click(toast.getByText(/View queue/), 900, { x: 0.15, y: 0.5 });
// Under load the toast can re-render under the click and swallow it; open
// the queue directly then, inside the cut.
await scene.cut(async () => {
  const pending = page.getByText("Pending").first();
  try {
    await pending.waitFor({ timeout: 15_000 });
  } catch {
    if (!queueHref) throw new Error("View queue link has no href");
    await page.goto(new URL(queueHref, page.url()).toString());
    await pending.waitFor({ timeout: 60_000 });
  }
});
await hold(300);
if (await toast.isVisible()) {
  await click(toast.getByRole("button").first(), 500);
  await toast.waitFor({ state: "hidden" });
}
await hold(500);
await click(page.getByText("Process queue").first(), 650, onIcon);
const markCompleted = page.getByRole("button", { name: /Mark Completed/ });
await scene.cut(async () => {
  await markCompleted.waitFor({ timeout: 60_000 });
  await page.getByText("First Pass").first().waitFor();
});
await hold(600);

// 4. Annotate the first item.
const annotateArea = { x: 1016, y: 90, width: 520, height: 300 };
await click(page.getByText("Select category").first(), 900, {
  x: 0.15,
  y: 0.5,
});
await hold(400);
await click(page.getByRole("option", { name: "Good Output" }), 500, {
  x: 0.04,
  y: 0.5,
});
await hold(900);
await click(markCompleted, 750, { x: 0.15, y: 0.5 });
wide();
// The next item loads in place; wait for its input to replace the first one.
await scene.cut(() =>
  page
    .getByText("Do you offer discounts")
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {}),
);
await hold(800);
await page.evaluate(() => document.activeElement?.blur());
await glideTo(1000, 560, 900);
await hold(900);
await scene.finish();
