import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Renders keyed items on one line and moves items that do not fit into a
 * caller-rendered overflow control. The component owns DOM measurement and
 * remeasures when its width, item widths, or overflow-control width changes.
 * `additionalOverflowCount` reserves the control for paginated or virtualized
 * entries that should not be mounted in the measurement row. Item and overflow
 * presentation remain entirely caller-defined.
 */
export function SingleLineOverflowList<TItem>({
  items,
  additionalOverflowCount,
  getKey,
  renderItem,
  renderOverflow,
}: {
  items: readonly TItem[];
  additionalOverflowCount: number;
  getKey: (item: TItem) => string;
  renderItem: (item: TItem) => ReactNode;
  renderOverflow: (props: {
    hiddenItems: readonly TItem[];
    overflowItemCount: number;
  }) => ReactNode;
}) {
  const measurementRowRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);
  const itemKeys = items.map(getKey);
  const itemKeySignature = itemKeys.join("\u0000");
  const hiddenKeySet = new Set(hiddenKeys);
  const visibleItems = items.filter((item) => !hiddenKeySet.has(getKey(item)));
  const hiddenItems = items.filter((item) => hiddenKeySet.has(getKey(item)));
  const overflowItemCount = hiddenItems.length + additionalOverflowCount;

  useEffect(() => {
    const measurementRow = measurementRowRef.current;
    if (!measurementRow) return;

    const measure = () => {
      const itemElements = Array.from(measurementRow.children) as HTMLElement[];
      const lastItem = itemElements.at(-1);
      const contentWidth = lastItem
        ? lastItem.offsetLeft + lastItem.offsetWidth
        : 0;
      const hasOverflow =
        additionalOverflowCount > 0 ||
        contentWidth > measurementRow.clientWidth - 1;
      const gap = Number.parseFloat(
        window.getComputedStyle(measurementRow).columnGap,
      );
      const availableWidth = hasOverflow
        ? measurementRow.clientWidth -
          (overflowRef.current?.offsetWidth ?? 0) -
          (Number.isFinite(gap) ? gap : 0)
        : measurementRow.clientWidth;
      const nextHiddenKeys = itemElements.flatMap((element) => {
        const key = element.dataset.overflowItemKey;
        return key &&
          element.offsetLeft + element.offsetWidth > availableWidth - 1
          ? [key]
          : [];
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

    return () => resizeObserver.disconnect();
  }, [additionalOverflowCount, itemKeySignature, overflowItemCount]);

  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <div
        ref={measurementRowRef}
        aria-hidden="true"
        className="invisible absolute inset-x-0 flex items-center gap-2 [&>*]:shrink-0"
      >
        {items.map((item) => {
          const key = getKey(item);
          return (
            <span
              key={key}
              data-overflow-item-key={key}
              className="flex items-center"
            >
              {renderItem(item)}
            </span>
          );
        })}
      </div>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden [&>*]:shrink-0">
        {visibleItems.map((item) => {
          const key = getKey(item);
          return (
            <span
              key={key}
              data-overflow-visible-item="true"
              className="flex items-center"
            >
              {renderItem(item)}
            </span>
          );
        })}
      </div>
      {overflowItemCount > 0 ? (
        <div ref={overflowRef} className="flex shrink-0 items-center">
          {renderOverflow({ hiddenItems, overflowItemCount })}
        </div>
      ) : null}
    </div>
  );
}
