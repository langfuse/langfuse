import { useEffect } from "react";

/**
 * Holds a top/bottom-anchored fixed element on the *visible* viewport while the
 * on-screen keyboard is up.
 *
 * A phone's keyboard shrinks the visual viewport but not the layout viewport
 * that `position: fixed` measures from, so `bottom: 0` lands behind the
 * keyboard. Recomputed from what the viewport reports on every event and never
 * accumulated: no number of open/close cycles can leave it out of phase, and
 * anything unexpected clamps back to the plain CSS anchoring. Written straight
 * onto the element because a keyboard transition streams events and the
 * anchored surfaces are expensive trees to re-render.
 */
export function useVisibleViewportAnchoring(
  element: HTMLElement | null,
  isEnabled: boolean,
) {
  useEffect(() => {
    // External system: the visual viewport. `resize` fires when the keyboard
    // opens or closes, `scroll` when Safari slides the visible band instead to
    // reveal a focused field. Absent on older browsers — CSS then owns it.
    const viewport = window.visualViewport;
    if (!isEnabled || !element || !viewport) {
      return;
    }

    const anchor = () => {
      const bandTop = Math.max(0, Math.round(viewport.offsetTop));
      const hiddenBelowBand = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - bandTop),
      );

      element.style.bottom = `${hiddenBelowBand}px`;
      // `max()` so the banner keeps the top edge whenever it is the lower of
      // the two; written at all only while the band is scrolled.
      element.style.top =
        bandTop > 0 ? `max(var(--banner-offset), ${bandTop}px)` : "";
    };

    anchor();
    viewport.addEventListener("resize", anchor);
    viewport.addEventListener("scroll", anchor);

    return () => {
      viewport.removeEventListener("resize", anchor);
      viewport.removeEventListener("scroll", anchor);
      element.style.bottom = "";
      element.style.top = "";
    };
  }, [element, isEnabled]);
}
