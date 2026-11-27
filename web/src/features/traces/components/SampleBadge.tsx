import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { useResizeObserver } from "@/src/hooks/useResizeObserver";
import { cn } from "@/src/utils/tailwind";

/** Space kept between the badge and the end of the tree row. */
const ROW_END_INSET_PX = 8;

/**
 * Marks the tree row that is the sample, on a line of its own. The badge may
 * run into the row's empty expand slot; a row too narrow even for that shows
 * no badge and relies on its tint.
 */
export function SampleBadge() {
  const lineRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  // Widest scrollbar the tree has shown, kept for when none shows.
  const scrollbarWidthRef = useRef(0);
  const [fits, setFits] = useState(true);

  const measure = useCallback(() => {
    const line = lineRef.current;
    const badge = badgeRef.current;
    if (!line || !badge) return;

    const row = line.closest("[data-tree-row]") ?? line;
    const available =
      row.getBoundingClientRect().right -
      line.getBoundingClientRect().left -
      ROW_END_INSET_PX;
    const scroller = line.closest<HTMLElement>("[data-tree-scroller]");
    const scrollbarWidth = scroller
      ? scroller.offsetWidth - scroller.clientWidth
      : 0;
    scrollbarWidthRef.current = Math.max(
      scrollbarWidthRef.current,
      scrollbarWidth,
    );
    // A hidden badge needs room for the scrollbar its own line can bring back.
    const scrollbarReserve = scrollbarWidthRef.current - scrollbarWidth;
    const badgeWidth = badge.offsetWidth;
    setFits(
      (wasFitting) =>
        badgeWidth <= available - (wasFitting ? 0 : scrollbarReserve),
    );
  }, []);
  // The first check runs before paint, so a row too narrow never shows the badge.
  useLayoutEffect(measure, [measure]);
  useResizeObserver(lineRef, measure);

  return (
    <span
      ref={lineRef}
      // A hidden badge stays measurable, clipped to a line with no height.
      className={cn(
        "flex min-w-0 basis-full",
        fits ? "mt-1" : "h-0 overflow-hidden",
      )}
    >
      <span
        ref={badgeRef}
        aria-hidden={!fits}
        className={cn("flex w-max", !fits && "invisible")}
      >
        <BadgeShell color="blue" size="sm">
          <span className="size-1.5 shrink-0 rounded-full bg-current" />
          <span className="whitespace-nowrap uppercase">Will be evaluated</span>
        </BadgeShell>
      </span>
    </span>
  );
}
