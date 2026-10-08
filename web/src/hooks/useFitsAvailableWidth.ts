import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Reports whether the natural width of the element on `contentRef` still fits
 * the width available inside the element on `availableRef`. Lets a caller swap
 * a wide presentation for a compact one at the width where the wide one
 * actually stops fitting, instead of at a fixed breakpoint that has to assume
 * the widest possible content.
 *
 * `fits` is undefined until the first measurement, so callers can hold back
 * both presentations instead of painting the wrong one. Every later change is
 * committed before the browser paints, so the swap never flashes.
 *
 * The measured content has to stay mounted and sized to its content while the
 * compact presentation is shown. Once it unmounts its natural width is no
 * longer observable and the caller can never go back to the wide presentation.
 *
 * The available element must not derive its own width from the measured
 * content, otherwise the two measurements feed back into each other and the
 * result oscillates. A flex item with a zero flex basis satisfies this.
 */
export function useFitsAvailableWidth<
  TAvailable extends HTMLElement,
  TContent extends HTMLElement,
>() {
  const availableRef = useRef<TAvailable>(null);
  const contentRef = useRef<TContent>(null);
  const [fits, setFits] = useState<boolean>();

  useLayoutEffect(() => {
    const available = availableRef.current;
    const content = contentRef.current;

    if (!available || !content) {
      return;
    }

    // Sub-pixel layout rounds against the content at the exact boundary, so
    // spend a pixel of slack rather than collapsing a row that just fits.
    const measure = () => content.scrollWidth <= available.clientWidth + 1;

    setFits(measure());

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    // Resize callbacks run before paint; a synchronous commit keeps it that way.
    const resizeObserver = new ResizeObserver(() => {
      flushSync(() => setFits(measure()));
    });
    resizeObserver.observe(available);
    resizeObserver.observe(content);

    return () => resizeObserver.disconnect();
  }, []);

  return { availableRef, contentRef, fits };
}
