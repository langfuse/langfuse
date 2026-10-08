import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

/**
 * Picks the tab indices an underline tab row shows when its triggers do not all
 * fit. Tabs fill the row in order until the next one would spill, and the rest
 * go behind an overflow trigger that needs `overflowWidth` of the row itself.
 *
 * The active tab always stays visible: when it would overflow, it takes the
 * last slot and the tabs it displaces move behind the trigger instead.
 */
export function getVisibleTabIndices({
  widths,
  availableWidth,
  overflowWidth,
  activeIndex,
}: {
  widths: number[];
  availableWidth: number;
  overflowWidth: number;
  activeIndex: number;
}): number[] {
  // Sub-pixel layout rounds against the content at the exact boundary, so
  // spend a pixel of slack rather than collapsing a row that just fits.
  const limit = availableWidth + 1;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= limit) return widths.map((_, index) => index);

  const budget = limit - overflowWidth;
  const active =
    activeIndex >= 0 && activeIndex < widths.length ? activeIndex : null;
  const visible: number[] = [];
  let used = active === null ? 0 : widths[active];

  const take = (from: number, to: number) => {
    for (let index = from; index < to; index++) {
      if (used + widths[index] > budget) return;
      used += widths[index];
      visible.push(index);
    }
  };

  if (active === null) {
    take(0, widths.length);
    return visible;
  }

  take(0, active);
  visible.push(active);
  take(active + 1, widths.length);
  return visible;
}

/**
 * Measures every tab from a hidden replica row and reports which ones fit next
 * to the overflow trigger inside the element on `availableRef`.
 *
 * The replica row on `measureRef` holds one child per tab, in order, followed
 * by a replica of the overflow trigger. It stays mounted and sized to its
 * content, so hidden tabs remain measurable and the row can bring them back.
 *
 * `measureKey` must change whenever the tabs' identity, order or labels change,
 * so the widths are read again in the new order. Size changes inside a replica,
 * such as a badge appearing, are picked up by observing each replica.
 *
 * `visibleIndices` is null until the first measurement, so callers can hold
 * the row back instead of painting the wrong set. Every later change is
 * committed before the browser paints, so the swap never flashes.
 *
 * The available element must not derive its width from the visible tabs,
 * otherwise the two measurements feed back into each other. A flex item with a
 * zero flex basis satisfies this.
 */
export function useTabsOverflow<
  TAvailable extends HTMLElement,
  TMeasure extends HTMLElement,
>(measureKey: string, activeIndex: number) {
  const availableRef = useRef<TAvailable>(null);
  const measureRef = useRef<TMeasure>(null);
  const [metrics, setMetrics] = useState<{
    availableWidth: number;
    overflowWidth: number;
    widths: number[];
  }>();

  useLayoutEffect(() => {
    const available = availableRef.current;
    const measure = measureRef.current;
    if (!available || !measure) return;

    const read = () => {
      const widths = Array.from(
        measure.children,
        (child) => child.getBoundingClientRect().width,
      );
      const overflowWidth = widths.pop() ?? 0;
      return { availableWidth: available.clientWidth, overflowWidth, widths };
    };

    setMetrics(read());

    if (typeof ResizeObserver === "undefined") return;

    // Resize callbacks run before paint; a synchronous commit keeps it that way.
    const resizeObserver = new ResizeObserver(() => {
      flushSync(() => setMetrics(read()));
    });
    resizeObserver.observe(available);
    for (const replica of measure.children) {
      resizeObserver.observe(replica);
    }

    return () => resizeObserver.disconnect();
  }, [measureKey]);

  const visibleIndices = useMemo(
    () => (metrics ? getVisibleTabIndices({ ...metrics, activeIndex }) : null),
    [activeIndex, metrics],
  );

  return { availableRef, measureRef, visibleIndices };
}
