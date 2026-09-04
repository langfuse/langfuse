import { test, expect, type Page } from "@playwright/test";

/**
 * The app shell is fully height- and width-constrained: page content scrolls
 * inside it, and the document itself must never scroll. These assertions need
 * real layout, so they live here rather than in a jsdom client test.
 */

const SHORT_VIEWPORT = { width: 1190, height: 560 };

async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  await page.fill('input[name="email"]', "demo@langfuse.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[data-testid="submit-email-password-sign-in-form"]');
  await expect(page).toHaveURL("/");
}

/** Document overflow in CSS px, per axis. */
function documentOverflow(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return {
      y: de.scrollHeight - de.clientHeight,
      x: de.scrollWidth - de.clientWidth,
    };
  });
}

test("a right drawer's absolutely-positioned content does not scroll the document", async ({
  page,
}) => {
  await page.setViewportSize(SHORT_VIEWPORT);
  await signIn(page);
  await page.getByRole("button", { name: "Support" }).click();
  const drawerBody = page.locator("#secondary div.overflow-y-auto").first();
  await expect(drawerBody).toBeVisible();

  // Tailwind's `sr-only` box, appended below the fold of the drawer's own
  // scroll area. With no positioned ancestor inside the drawer it resolves its
  // containing block against the app shell, escapes the drawer's clip and
  // grows the document instead of scrolling inside the drawer.
  await drawerBody.evaluate((body) => {
    const probe = document.createElement("span");
    probe.dataset.testid = "overflow-probe";
    probe.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)";
    const spacer = document.createElement("div");
    spacer.style.height = "1200px";
    body.append(spacer, probe);
  });

  expect(await documentOverflow(page)).toEqual({ y: 0, x: 0 });
});

test("a vertical document scrollbar does not spawn a horizontal one", async ({
  page,
}) => {
  await page.setViewportSize(SHORT_VIEWPORT);
  await signIn(page);
  // Viewport units ignore scrollbars, so a shell sized off `100vw` overshoots
  // the space beside the sidebar by the scrollbar's width once one is showing.
  // Sizing `::-webkit-scrollbar` opts out of overlay scrollbars where the
  // platform defaults to them, the way Windows and Linux behave natively.
  await page.addStyleTag({
    content: "::-webkit-scrollbar { width: 15px; height: 15px }",
  });
  await page.evaluate(() => {
    document.documentElement.style.overflowY = "scroll";
  });
  const scrollbarWidth = await page.evaluate(
    () => window.innerWidth - document.documentElement.clientWidth,
  );
  test.skip(
    scrollbarWidth === 0,
    "this browser refuses space-taking scrollbars, so there is nothing to overshoot",
  );

  expect((await documentOverflow(page)).x).toBe(0);
});
