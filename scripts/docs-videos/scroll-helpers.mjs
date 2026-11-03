/**
 * Scrolls the nearest scroll container under a point (default: the viewport
 * center) with the browser's own smooth scrolling. One call, so app
 * re-renders cannot stretch the motion out.
 */
export async function smoothScroll(page, dy, at = null, settleMs = 900) {
  await page.evaluate(
    ([dy, at]) => {
      const x = at ? at.x : innerWidth / 2;
      const y = at ? at.y : innerHeight / 2;
      let el = document.elementFromPoint(x, y);
      while (
        el &&
        !(
          el.scrollHeight > el.clientHeight + 10 &&
          /(auto|scroll)/.test(getComputedStyle(el).overflowY)
        )
      ) {
        el = el.parentElement;
      }
      (el ?? document.scrollingElement).scrollBy({
        top: dy,
        behavior: "smooth",
      });
    },
    [dy, at],
  );
  await page.waitForTimeout(settleMs);
}

/** Waits until no skeleton placeholders are left on the page. */
export const skeletonsGone = (page, timeout = 30_000) =>
  page.waitForFunction(() => !document.querySelector(".animate-pulse"), null, {
    timeout,
  });
