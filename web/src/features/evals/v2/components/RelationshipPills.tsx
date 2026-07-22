import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/src/utils/tailwind";

const FALLBACK_GAP_PX = 6;

export function RelationshipPills({
  items,
  totalCount,
  emptyLabel = "None",
}: {
  items: Array<{ id: string; name: string }>;
  totalCount: number;
  emptyLabel?: string;
}) {
  const availableItems = items.slice(0, totalCount);
  const rootRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    visibleCount: availableItems.length,
    truncateLast: false,
  });
  const itemSignature = availableItems
    .map((item) => `${item.id}:${item.name}`)
    .join("\u0000");

  useLayoutEffect(() => {
    const root = rootRef.current;
    const container = root?.querySelector<HTMLElement>(
      "[data-relationship-pills-visible]",
    );
    if (!root || !container) return;

    const measure = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) return;

      const pillWidths = Array.from(
        root.querySelectorAll<HTMLElement>("[data-relationship-pill-measure]"),
        (element) => element.offsetWidth,
      );
      const measuredGap = Number.parseFloat(
        window.getComputedStyle(container).columnGap,
      );
      const gap = Number.isFinite(measuredGap) ? measuredGap : FALLBACK_GAP_PX;

      for (
        let visibleCount = pillWidths.length;
        visibleCount > 0;
        visibleCount--
      ) {
        const hiddenCount = Math.max(0, totalCount - visibleCount);
        const pillsWidth = pillWidths
          .slice(0, visibleCount)
          .reduce((total, width) => total + width, 0);
        const pillsGapWidth = Math.max(0, visibleCount - 1) * gap;
        const overflowElement =
          hiddenCount > 0
            ? root.querySelector<HTMLElement>(
                `[data-relationship-overflow-measure="${hiddenCount}"]`,
              )
            : null;
        const overflowWidth = overflowElement?.offsetWidth ?? 0;
        const overflowGapWidth = hiddenCount > 0 ? gap : 0;

        if (
          pillsWidth + pillsGapWidth + overflowWidth + overflowGapWidth <=
          availableWidth
        ) {
          setLayout((current) =>
            current.visibleCount === visibleCount && !current.truncateLast
              ? current
              : { visibleCount, truncateLast: false },
          );
          return;
        }
      }

      const fallback = {
        visibleCount: availableItems.length > 0 ? 1 : 0,
        truncateLast: availableItems.length > 0,
      };
      setLayout((current) =>
        current.visibleCount === fallback.visibleCount &&
        current.truncateLast === fallback.truncateLast
          ? current
          : fallback,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [availableItems.length, itemSignature, totalCount]);

  const visibleCount = Math.min(layout.visibleCount, availableItems.length);
  const visibleItems = availableItems.slice(0, visibleCount);
  const hiddenCount = Math.max(0, totalCount - visibleCount);

  if (totalCount === 0) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }

  return (
    <div ref={rootRef} className="relative max-w-full min-w-0">
      <div
        data-relationship-pills-visible
        className="flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden"
      >
        {visibleItems.map((item, index) => {
          const shouldTruncate =
            layout.truncateLast && index === visibleItems.length - 1;
          return (
            <span
              key={item.id}
              className={cn(
                "bg-input rounded-md px-2 py-1 text-xs",
                shouldTruncate
                  ? "min-w-0 flex-1 truncate"
                  : "shrink-0 whitespace-nowrap",
              )}
              title={item.name}
            >
              {item.name}
            </span>
          );
        })}
        {hiddenCount > 0 ? (
          <span
            className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-1 text-xs"
            title={`${hiddenCount} more`}
          >
            +{hiddenCount}
          </span>
        ) : null}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center gap-1.5"
      >
        {availableItems.map((item, index) => (
          <span
            key={item.id}
            data-relationship-pill-measure={index}
            className="bg-input shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap"
          >
            {item.name}
          </span>
        ))}
        {Array.from({ length: availableItems.length + 1 }, (_, visible) => {
          const overflow = totalCount - visible;
          return overflow > 0 ? (
            <span
              key={overflow}
              data-relationship-overflow-measure={overflow}
              className="bg-muted text-muted-foreground shrink-0 rounded-md px-1.5 py-1 text-xs"
            >
              +{overflow}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}
