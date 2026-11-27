import { cn } from "@/src/utils/tailwind";
import { cva, type VariantProps } from "class-variance-authority";
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
 * remeasures when its width or item widths change, when the overflow control
 * mounts, and when the overflow control's width changes. Overflow-control
 * remasures only lower visibleCount.
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
const rowVariants = cva("flex items-center", {
  variants: {
    spacing: {
      tight: "gap-1",
      compact: "gap-2",
      comfortable: "gap-4",
    },
    alignment: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
    },
  },
});
export function OverflowList<TItem>({
  items,
  additionalOverflowCount,
  getKey,
  renderItem,
  renderOverflow,
  trailingContent,
  spacing = "compact",
  alignment = "start",
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
  // TODO: typed API
  // eslint-disable-next-line @repo/no-node-slot-props -- pinned row content is still caller-rendered
  trailingContent?: ReactNode;
  spacing?: NonNullable<VariantProps<typeof rowVariants>["spacing"]>;
  alignment?: NonNullable<VariantProps<typeof rowVariants>["alignment"]>;
  /** Tight items sit 4px from a preceding tight item instead of the row gap. */
  isTightItem?: (item: TItem) => boolean;
  minVisible?: 0 | 1;
}) {
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
        className={cn(
          "invisible relative col-start-1 row-start-1 h-0",
          rowVariants({ spacing }),
        )}
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
        className={cn(
          "col-start-1 row-start-1 min-w-0",
          rowVariants({ spacing, alignment }),
        )}
      >
        {visibleItems.length > 0 ? (
          <div
            className={cn("min-w-0 overflow-hidden", rowVariants({ spacing }))}
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
  const measureRef = useRef<
    ((options?: { allowIncrease?: boolean }) => void) | null
  >(null);
  const trailingContentRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const itemKeySignature = items.map(getKey).join("\u0000");
  const overflowItemCount =
    Math.max(0, items.length - visibleCount) + additionalOverflowCount;
  const hasOverflowControl = overflowItemCount > 0;

  useLayoutEffect(() => {
    const measurementRow = measurementRowRef.current;
    if (!measurementRow) return;

    const commitVisibleCount = (
      next: number,
      { allowIncrease = true }: { allowIncrease?: boolean } = {},
    ) => {
      setVisibleCount((current) => {
        if (next === current) return current;
        if (!allowIncrease && next > current) return current;
        return next;
      });
    };
    const measure = (options?: { allowIncrease?: boolean }) => {
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
        contentWidth <= availableWidthBeforeOverflow + 1
      ) {
        commitVisibleCount(itemElements.length, options);
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
        return element.offsetLeft + element.offsetWidth > availableWidth + 1;
      });
      commitVisibleCount(
        firstHiddenIndex === -1
          ? itemElements.length
          : Math.max(minVisible, firstHiddenIndex),
        options,
      );
    };

    measureRef.current = measure;
    measure();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        measureRef.current = null;
      };
    }

    // Commit before paint so resizing doesn't flash the previous item count.
    const resizeObserver = new ResizeObserver(() => flushSync(measure));
    resizeObserver.observe(measurementRow);
    for (const child of measurementRow.children) {
      resizeObserver.observe(child);
    }
    if (trailingContentRef.current) {
      resizeObserver.observe(trailingContentRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      measureRef.current = null;
    };
  }, [
    additionalOverflowCount,
    hasTrailingContent,
    itemKeySignature,
    spacing,
    minVisible,
  ]);

  // Remeasure when the overflow control mounts or its width changes. That
  // path only lowers visibleCount.
  useLayoutEffect(() => {
    if (!hasOverflowControl) return;
    const overflowNode = overflowRef.current;
    if (!overflowNode) return;

    measureRef.current?.({ allowIncrease: false });
    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(() => {
      flushSync(() => {
        measureRef.current?.({ allowIncrease: false });
      });
    });
    resizeObserver.observe(overflowNode);
    return () => {
      resizeObserver.disconnect();
    };
  }, [hasOverflowControl]);

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
