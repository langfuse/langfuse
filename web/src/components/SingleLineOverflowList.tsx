import { cn } from "@/src/utils/tailwind";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Renders keyed items on one line and moves items that do not fit into a
 * caller-rendered overflow control. The component owns DOM measurement and
 * remeasures when its width, item widths, or overflow-control width changes.
 * `additionalOverflowCount` reserves the control for paginated or virtualized
 * entries that should not be mounted in the measurement row. Item and overflow
 * presentation remain entirely caller-defined. `trailingContent` stays pinned
 * immediately after the overflow control and participates in width measurement.
 *
 * The row gap only ever separates rendered content, so every row starts on the
 * same inline edge whether it holds items, only the overflow control, or
 * nothing at all.
 */

// Rows of boxed pills read fine at gap-2; rows of mostly-plain text (the
// session header's metrics/attributes/links) need more air to scan as
// separate facts, matching the trace headers' gap-4; bordered chips pull to 4px.
/** Matches `-ml-3`, the pull applied to tight items and the overflow control. */
const TIGHT_PULL_PX = 12;
const SPACING_CLASS = {
  compact: "gap-2",
  comfortable: "gap-4",
} as const;
export function SingleLineOverflowList<TItem>({
  items,
  additionalOverflowCount,
  getKey,
  renderItem,
  renderOverflow,
  trailingContent,
  spacing = "compact",
  isTightItem,
}: {
  items: readonly TItem[];
  additionalOverflowCount: number;
  getKey: (item: TItem) => string;
  renderItem: (item: TItem) => ReactNode;
  renderOverflow: (props: {
    hiddenItems: readonly TItem[];
    overflowItemCount: number;
  }) => ReactNode;
  trailingContent?: ReactNode;
  spacing?: keyof typeof SPACING_CLASS;
  /** Tight items sit 4px from a preceding tight item instead of the row gap. */
  isTightItem?: (item: TItem) => boolean;
}) {
  const gapClass = SPACING_CLASS[spacing];
  const measurementRowRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const trailingContentRef = useRef<HTMLDivElement>(null);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const itemKeys = items.map(getKey);
  const itemKeySignature = itemKeys.join("\u0000");
  const hiddenKeySet = new Set(hiddenKeys);
  const visibleItems = items.filter((item) => !hiddenKeySet.has(getKey(item)));
  const hiddenItems = items.filter((item) => hiddenKeySet.has(getKey(item)));
  const overflowItemCount = hiddenItems.length + additionalOverflowCount;
  const hasTrailingContent =
    trailingContent !== null && trailingContent !== undefined;

  useEffect(() => {
    const measurementRow = measurementRowRef.current;
    if (!measurementRow) return;

    const measure = () => {
      const itemElements = Array.from(measurementRow.children) as HTMLElement[];
      const lastItem = itemElements.at(-1);
      const contentWidth = lastItem
        ? lastItem.offsetLeft + lastItem.offsetWidth
        : 0;
      const gap = Number.parseFloat(
        window.getComputedStyle(measurementRow).columnGap,
      );
      const normalizedGap = Number.isFinite(gap) ? gap : 0;
      const trailingContentWidth = trailingContentRef.current?.offsetWidth ?? 0;
      const availableWidthBeforeOverflow =
        measurementRow.clientWidth -
        trailingContentWidth -
        (trailingContentWidth > 0 ? normalizedGap : 0);
      const hasOverflow =
        additionalOverflowCount > 0 ||
        contentWidth > availableWidthBeforeOverflow - 1;
      const overflowWidth = overflowRef.current?.offsetWidth ?? 0;
      // The overflow control pulls in after a tight item, so it needs less room.
      const availableWidthFor = (element: HTMLElement) =>
        hasOverflow
          ? availableWidthBeforeOverflow -
            overflowWidth -
            Math.max(
              0,
              element.dataset.tight
                ? normalizedGap - TIGHT_PULL_PX
                : normalizedGap,
            )
          : availableWidthBeforeOverflow;
      const firstHiddenIndex = itemElements.findIndex(
        (element) =>
          element.offsetLeft + element.offsetWidth >
          availableWidthFor(element) - 1,
      );
      const nextHiddenKeys =
        firstHiddenIndex === -1
          ? []
          : itemElements.slice(firstHiddenIndex).flatMap((element) => {
              const key = element.dataset.overflowItemKey;
              return key ? [key] : [];
            });

      setHiddenKeys((current) =>
        current.length === nextHiddenKeys.length &&
        current.every((key, index) => key === nextHiddenKeys[index])
          ? current
          : nextHiddenKeys,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(measurementRow);
    for (const child of measurementRow.children) {
      resizeObserver.observe(child);
    }
    if (overflowRef.current) {
      resizeObserver.observe(overflowRef.current);
    }
    if (trailingContentRef.current) {
      resizeObserver.observe(trailingContentRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [
    additionalOverflowCount,
    hasTrailingContent,
    itemKeySignature,
    overflowItemCount,
  ]);

  const lastVisibleItem = visibleItems.at(-1);

  return (
    <div
      className={`relative flex min-w-0 flex-1 items-center overflow-hidden ${gapClass}`}
    >
      <div
        ref={measurementRowRef}
        aria-hidden="true"
        className={`invisible absolute inset-x-0 flex items-center [&>*]:shrink-0 ${gapClass}`}
      >
        {items.map((item) => {
          const key = getKey(item);
          return (
            <span
              key={key}
              data-overflow-item-key={key}
              data-tight={isTightItem?.(item) ? "true" : undefined}
              className={cn(
                "flex items-center",
                isTightItem?.(item) && "[[data-tight]+&]:-ml-3",
              )}
            >
              {renderItem(item)}
            </span>
          );
        })}
      </div>
      {visibleItems.length > 0 ? (
        <div
          className={`flex min-w-0 items-center overflow-hidden [&>*]:shrink-0 ${gapClass}`}
        >
          {visibleItems.map((item) => {
            const key = getKey(item);
            return (
              <span
                key={key}
                data-overflow-visible-item="true"
                data-tight={isTightItem?.(item) ? "true" : undefined}
                className={cn(
                  "flex items-center",
                  isTightItem?.(item) && "[[data-tight]+&]:-ml-3",
                )}
              >
                {renderItem(item)}
              </span>
            );
          })}
        </div>
      ) : null}
      {overflowItemCount > 0 ? (
        <div
          ref={overflowRef}
          className={cn(
            "flex shrink-0 items-center",
            lastVisibleItem !== undefined &&
              isTightItem?.(lastVisibleItem) &&
              "-ml-3",
          )}
        >
          {renderOverflow({ hiddenItems, overflowItemCount })}
        </div>
      ) : null}
      {hasTrailingContent ? (
        <div ref={trailingContentRef} className="flex shrink-0 items-center">
          {trailingContent}
        </div>
      ) : null}
    </div>
  );
}
