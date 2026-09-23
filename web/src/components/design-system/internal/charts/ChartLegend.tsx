"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";
import { cn } from "@/src/utils/tailwind";

export type ChartLegendItem = {
  id: string;
  label: ReactNode;
  color: string;
  value?: { label: string; value: ReactNode };
  muted?: boolean;
  action?: {
    label: string;
    pressed: boolean;
    onClick: () => void;
  };
};

const LEGEND_ITEM_GAP = 16;
const LEGEND_PADDING = "min-w-0 shrink-0 px-4 py-2";

function LegendItem({ item }: { item: ChartLegendItem }) {
  const plainTextLabel =
    typeof item.label === "string"
      ? item.label
      : getPlainTextFromReactNode(item.label);
  const plainTextValue = item.value
    ? getPlainTextFromReactNode(item.value.value)
    : undefined;
  const title = `${plainTextLabel ?? ""}${
    item.value && plainTextValue
      ? ` (${item.value.label}: ${plainTextValue})`
      : ""
  }`;
  const content = (
    <>
      <div
        className="h-2 w-2 shrink-0 rounded-[2px]"
        style={{ backgroundColor: item.color }}
      />
      <span
        className="text-muted-foreground truncate"
        title={title || undefined}
      >
        {item.label}
        {item.value !== undefined ? (
          <>
            {" "}
            ({item.value.label}: {item.value.value})
          </>
        ) : null}
      </span>
    </>
  );
  const className = cn(
    "flex max-w-full min-w-0 items-center gap-1.5 text-xs whitespace-nowrap transition-opacity",
    item.muted && "opacity-40",
  );

  return item.action ? (
    <button
      type="button"
      onClick={item.action.onClick}
      className={cn(className, "cursor-pointer hover:opacity-80")}
      aria-pressed={item.action.pressed}
      aria-label={item.action.label}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function ChartLegend({
  items,
  selectionActions,
}: {
  items: ChartLegendItem[];
  selectionActions?: {
    allSelected: boolean;
    onSelectAll: () => void;
    onDeselectAll: () => void;
  };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const overflowTriggerRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const itemCountRef = useRef(items.length);
  const [visibleItemCount, setVisibleItemCount] = useState(0);
  itemCountRef.current = items.length;

  const measurementKey = items
    .map(
      (item) =>
        `${item.id}|${getPlainTextFromReactNode(item.label) ?? ""}|${item.value?.label ?? ""}|${getPlainTextFromReactNode(item.value?.value) ?? ""}`,
    )
    .join(";");

  const updateVisibleItemCount = useCallback(() => {
    const availableWidth = containerRef.current?.clientWidth ?? 0;
    const itemCount = itemCountRef.current;
    const itemWidths = Array.from(
      { length: itemCount },
      (_, index) => itemRefs.current[index]?.getBoundingClientRect().width ?? 0,
    );
    const allItemsWidth =
      itemWidths.reduce((total, width) => total + width, 0) +
      Math.max(0, itemCount - 1) * LEGEND_ITEM_GAP;
    if (allItemsWidth <= availableWidth) {
      setVisibleItemCount(itemCount);
      return;
    }

    let visibleWidth = 0;
    let nextVisibleItemCount = 0;
    for (let index = 0; index < itemCount; index += 1) {
      const hiddenItemCount = itemCount - index - 1;
      if (hiddenItemCount === 0) break;
      const triggerWidth =
        overflowTriggerRefs.current[
          hiddenItemCount - 1
        ]?.getBoundingClientRect().width ?? 0;
      const nextWidth =
        visibleWidth +
        itemWidths[index] +
        triggerWidth +
        (index > 0 ? 2 : 1) * LEGEND_ITEM_GAP;
      if (nextWidth > availableWidth) break;
      visibleWidth += itemWidths[index] + (index > 0 ? LEGEND_ITEM_GAP : 0);
      nextVisibleItemCount = index + 1;
    }
    setVisibleItemCount(nextVisibleItemCount);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateVisibleItemCount);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateVisibleItemCount]);

  useLayoutEffect(() => {
    updateVisibleItemCount();
  }, [measurementKey, updateVisibleItemCount]);

  const visibleItems = items.slice(0, visibleItemCount);
  const hiddenItems = items.slice(visibleItemCount);

  return (
    <div className={cn(LEGEND_PADDING, "relative")}>
      <div
        ref={containerRef}
        className="flex min-w-0 items-center justify-center gap-4 overflow-hidden"
      >
        {visibleItems.map((item) => (
          <LegendItem key={item.id} item={item} />
        ))}
        {hiddenItems.length > 0 ? (
          <DropdownMenu
            title="Additional series"
            items={[
              ...(selectionActions
                ? [
                    {
                      id: "all-series",
                      type: "item" as const,
                      title: selectionActions.allSelected
                        ? "Deselect all"
                        : "Select all",
                      onClick: selectionActions.allSelected
                        ? selectionActions.onDeselectAll
                        : selectionActions.onSelectAll,
                    },
                    { id: "all-series-separator", type: "separator" as const },
                  ]
                : []),
              ...hiddenItems.map((item) => ({
                id: item.id,
                type: "item" as const,
                title: `${
                  typeof item.label === "string"
                    ? item.label
                    : (item.action?.label ?? item.id)
                }${
                  item.value &&
                  (typeof item.value.value === "string" ||
                    typeof item.value.value === "number")
                    ? ` (${item.value.label}: ${item.value.value})`
                    : ""
                }`,
                disabled: item.action
                  ? undefined
                  : { reason: "This legend item is not interactive" },
                onClick: item.action?.onClick ?? (() => undefined),
              })),
            ]}
          >
            {({ getTriggerProps }) => (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
                aria-label={`Show ${hiddenItems.length} additional series`}
                {...getTriggerProps()}
              >
                +{hiddenItems.length}
              </button>
            )}
          </DropdownMenu>
        ) : null}
      </div>

      <div
        aria-hidden="true"
        className="invisible absolute top-0 left-0 flex h-0 items-center gap-4 overflow-hidden whitespace-nowrap"
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
          >
            <LegendItem item={item} />
          </div>
        ))}
        {items.map((_, index) => (
          <span
            key={index}
            ref={(element) => {
              overflowTriggerRefs.current[index] = element;
            }}
            className="text-xs"
          >
            +{index + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
