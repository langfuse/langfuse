import { cn } from "@/src/utils/tailwind";
import {
  Fragment,
  type ComponentProps,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

/**
 * Renders keyed items on one line and moves items that do not fit into a
 * caller-rendered overflow control. The component owns DOM measurement and
 * remeasures when its width, item widths, or overflow-control width changes.
 * `additionalOverflowCount` reserves the control for paginated or virtualized
 * entries that should not be mounted in the measurement row. Item and overflow
 * presentation remain entirely caller-defined. Apply `getItemProps` to each
 * item's single root DOM element; it supplies measurement markers and merges
 * layout classes. `trailingContent` stays pinned immediately after the overflow
 * control and participates in width measurement.
 *
 * The row gap only ever separates rendered content, so every row starts on the
 * same inline edge whether it holds items, only the overflow control, or
 * nothing at all.
 */

// Rows of boxed pills read fine at gap-2; rows of mostly-plain text (the
// session header's metrics/attributes/links) need more air to scan as
// separate facts, matching the trace headers' gap-4; bordered chips pull to 4px.
const SPACING_CLASS = {
  tight: "gap-1",
  compact: "gap-2",
  comfortable: "gap-4",
} as const;
export function OverflowList<TItem>({
  items,
  additionalOverflowCount,
  getKey,
  renderItem,
  renderOverflow,
  trailingContent,
  spacing = "compact",
  isTightItem,
  minVisible,
}: {
  items: readonly TItem[];
  additionalOverflowCount: number;
  getKey: (item: TItem) => string;
  renderItem: (
    item: TItem,
    controls: {
      getItemProps: (
        props?: HTMLAttributes<HTMLElement>,
      ) => HTMLAttributes<HTMLElement> & {
        "data-overflow-item"?: true;
        "data-overflow-visible-item"?: "true";
        "data-tight"?: "true";
      };
    },
  ) => ReactElement;
  renderOverflow: (props: {
    hiddenItems: readonly TItem[];
    overflowItemCount: number;
  }) => ReactNode;
  trailingContent?: ReactNode;
  spacing?: keyof typeof SPACING_CLASS;
  /** Tight items sit 4px from a preceding tight item instead of the row gap. */
  isTightItem?: (item: TItem) => boolean;
  minVisible?: 0 | 1;
}) {
  const gapClass = SPACING_CLASS[spacing];
  const hasTrailingContent =
    trailingContent !== null && trailingContent !== undefined;
  const {
    measurementRowRef,
    overflowRef,
    trailingContentRef,
    visibleCount,
    overflowItemCount,
    getItemProps,
  } = useOverflowList({
    items,
    getKey,
    additionalOverflowCount,
    spacing,
    isTightItem,
    minVisible,
    hasTrailingContent,
  });
  const visibleItems = items.slice(0, visibleCount);
  const hiddenItems = items.slice(visibleCount);
  const lastVisibleItem = visibleItems.at(-1);

  return (
    <div className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden">
      <div
        ref={measurementRowRef}
        aria-hidden="true"
        inert
        className={`invisible relative col-start-1 row-start-1 flex h-0 items-center ${gapClass}`}
      >
        {items.map((item) => (
          <Fragment key={getKey(item)}>
            {renderItem(item, {
              getItemProps: (props) => getItemProps(item, "measurement", props),
            })}
          </Fragment>
        ))}
        {hasTrailingContent && (
          <div className="flex shrink-0 items-center">{trailingContent}</div>
        )}
      </div>
      <div
        className={`col-start-1 row-start-1 flex min-w-0 items-center ${gapClass}`}
      >
        {visibleItems.length > 0 ? (
          <div
            className={`flex min-w-0 items-center overflow-hidden ${gapClass}`}
          >
            {visibleItems.map((item) => (
              <Fragment key={getKey(item)}>
                {renderItem(item, {
                  getItemProps: (props) => getItemProps(item, "visible", props),
                })}
              </Fragment>
            ))}
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
    </div>
  );
}

/** Matches `-ml-3`, the pull applied to tight items and the overflow control. */
const TIGHT_PULL_PX = 12;

function useOverflowList<TItem>({
  items,
  getKey,
  additionalOverflowCount,
  spacing,
  isTightItem,
  minVisible = 0,
  hasTrailingContent,
}: Pick<
  ComponentProps<typeof OverflowList<TItem>>,
  | "items"
  | "getKey"
  | "additionalOverflowCount"
  | "spacing"
  | "isTightItem"
  | "minVisible"
> & {
  hasTrailingContent: boolean;
}) {
  const measurementRowRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const trailingContentRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const itemKeySignature = items.map(getKey).join("\u0000");
  const overflowItemCount =
    Math.max(0, items.length - visibleCount) + additionalOverflowCount;

  useLayoutEffect(() => {
    const measurementRow = measurementRowRef.current;
    if (!measurementRow) return;

    const measure = () => {
      const itemElements = Array.from(
        measurementRow.querySelectorAll<HTMLElement>(
          ":scope > [data-overflow-item]",
        ),
      );
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
      if (
        additionalOverflowCount <= 0 &&
        contentWidth <= availableWidthBeforeOverflow - 1
      ) {
        setVisibleCount(itemElements.length);
        return;
      }

      const overflowWidth = overflowRef.current?.offsetWidth ?? 0;
      const firstHiddenIndex = itemElements.findIndex((element) => {
        // The overflow control pulls in after a tight item, so it needs less room.
        const overflowGap = Math.max(
          0,
          element.dataset.tight ? normalizedGap - TIGHT_PULL_PX : normalizedGap,
        );
        const availableWidth =
          availableWidthBeforeOverflow - overflowWidth - overflowGap;
        return element.offsetLeft + element.offsetWidth > availableWidth - 1;
      });
      setVisibleCount(
        firstHiddenIndex === -1
          ? itemElements.length
          : Math.max(minVisible, firstHiddenIndex),
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;

    // Commit before paint so resizing doesn't flash the previous item count.
    const resizeObserver = new ResizeObserver(() => flushSync(measure));
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
    spacing,
    minVisible,
  ]);

  const getItemProps = (
    item: TItem,
    row: "measurement" | "visible",
    props?: HTMLAttributes<HTMLElement>,
  ) => ({
    ...props,
    "data-overflow-item": row === "measurement" ? (true as const) : undefined,
    "data-overflow-visible-item":
      row === "visible" ? ("true" as const) : undefined,
    "data-tight": isTightItem?.(item) ? ("true" as const) : undefined,
    className: cn(
      "flex items-center",
      row === "visible" && "min-w-0",
      props?.className,
      (row === "measurement" || minVisible === 0) && "shrink-0",
      isTightItem?.(item) && "[[data-tight]+&]:-ml-3",
    ),
  });

  return {
    measurementRowRef,
    overflowRef,
    trailingContentRef,
    visibleCount,
    overflowItemCount,
    getItemProps,
  };
}
