import { useLayoutEffect, useRef, useState } from "react";

const TAG_GAP_PX = 4;

/**
 * How many tags of a row fit in the space it may take, with a "+N" tag for
 * the rest. Every tag is rendered once in an invisible measuring layer, so
 * the visible row only holds what fits and never reserves space for the rest.
 * `reservedPx` is space the row needs besides its tags, such as padding.
 */
export function useTagOverflow(itemCount: number, reservedPx: number) {
  const availableRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const overflowTagRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useLayoutEffect(() => {
    const available = availableRef.current;
    const measure = measureRef.current;
    if (!available || !measure) return;

    const recompute = () => {
      const widths = Array.from(
        measure.children,
        (tag) => (tag as HTMLElement).offsetWidth,
      );
      const overflowWidth = overflowTagRef.current?.offsetWidth ?? 0;
      const space = available.clientWidth - reservedPx;
      let used = 0;
      let count = 0;
      for (const [index, width] of widths.entries()) {
        const next = used + (index > 0 ? TAG_GAP_PX : 0) + width;
        const isLast = index === widths.length - 1;
        const needed = isLast ? next : next + TAG_GAP_PX + overflowWidth;
        if (needed > space) break;
        used = next;
        count += 1;
      }
      setVisibleCount(count);
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(available);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [itemCount, reservedPx]);

  return {
    availableRef,
    measureRef,
    overflowTagRef,
    visibleCount,
    hiddenCount: itemCount - visibleCount,
  };
}
