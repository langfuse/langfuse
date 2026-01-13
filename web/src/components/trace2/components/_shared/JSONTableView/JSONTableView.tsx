/**
 * JSONTableView - Generic virtualized table with customizable columns.
 *
 * Features:
 * - Conditional virtualization based on `virtualized` prop
 * - Customizable columns with render functions
 * - Expandable rows (controlled/uncontrolled)
 * - Sticky header support
 * - Row prefix support (for tree indentation)
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/src/utils/tailwind";
import { type JSONTableViewProps } from "./json-table-view-types";
import { JSONTableViewHeader } from "./JSONTableViewHeader";
import { JSONTableViewRow } from "./JSONTableViewRow";

// Default row heights for virtualization
const DEFAULT_COLLAPSED_ROW_HEIGHT = 28;
const DEFAULT_EXPANDED_ROW_HEIGHT = 150;

/**
 * Generic virtualized table component.
 */
export function JSONTableView<T>({
  items,
  columns,
  getItemKey,
  expandable = false,
  renderExpanded,
  expandedKeys: controlledExpandedKeys,
  onExpandedKeysChange,
  virtualized = false,
  collapsedRowHeight = DEFAULT_COLLAPSED_ROW_HEIGHT,
  expandedRowHeight = DEFAULT_EXPANDED_ROW_HEIGHT,
  stickyHeaderContent,
  onVisibleItemsChange,
  renderRowPrefix,
  overscan = 100,
  className,
}: JSONTableViewProps<T>) {
  // Internal expand state (uncontrolled mode)
  const [internalExpandedKeys, setInternalExpandedKeys] = useState<Set<string>>(
    new Set(),
  );

  // Determine if controlled or uncontrolled
  const isControlled = controlledExpandedKeys !== undefined;
  const expandedKeys = isControlled
    ? controlledExpandedKeys
    : internalExpandedKeys;

  // Refs for scroll containers
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track scroll position for non-virtualized sticky header
  const [scrollTopIndex, setScrollTopIndex] = useState(0);

  // Toggle expand/collapse for a row
  const handleToggle = useCallback(
    (key: string) => {
      const updateKeys = (prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      };

      if (isControlled) {
        onExpandedKeysChange?.(updateKeys(expandedKeys));
      } else {
        setInternalExpandedKeys(updateKeys);
      }
    },
    [isControlled, expandedKeys, onExpandedKeysChange],
  );

  // Estimate row size based on expand state
  const estimateSize = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return collapsedRowHeight;
      const key = getItemKey(item);
      return expandedKeys.has(key) ? expandedRowHeight : collapsedRowHeight;
    },
    [items, getItemKey, expandedKeys, collapsedRowHeight, expandedRowHeight],
  );

  // Set up virtualizer (only used when virtualized is true)
  const rowVirtualizer = useVirtualizer({
    count: virtualized ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: overscan,
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
    enabled: virtualized,
  });

  // Track topmost visible item for sticky header (virtualized mode)
  const virtualizedTopmostIndex = useMemo(() => {
    if (!virtualized) return 0;
    const virtualItems = rowVirtualizer.getVirtualItems();
    return virtualItems[0]?.index ?? 0;
  }, [virtualized, rowVirtualizer]);

  // Track scroll position for non-virtualized sticky header
  useEffect(() => {
    if (virtualized || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const handleScroll = () => {
      const rows = container.querySelectorAll("[data-row-index]");

      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;

        if (relativeTop >= -rect.height / 2) {
          const index = parseInt(row.getAttribute("data-row-index") ?? "0", 10);
          setScrollTopIndex(index);
          break;
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [virtualized]);

  // Compute topmost item and index
  const topmostIndex = virtualized ? virtualizedTopmostIndex : scrollTopIndex;
  const topmostItem = items[topmostIndex] ?? null;

  // Notify about visible items changes (for viewport-based prefetching)
  useEffect(() => {
    if (!virtualized || !onVisibleItemsChange) return;

    const virtualItems = rowVirtualizer.getVirtualItems();
    const visibleItems = virtualItems
      .map((vi) => items[vi.index])
      .filter((item): item is T => item !== undefined);

    if (visibleItems.length > 0) {
      onVisibleItemsChange(visibleItems);
    }
  }, [virtualized, rowVirtualizer, items, onVisibleItemsChange]);

  // Check if we have items
  const hasItems = items.length > 0;
  const hasExpandIcon = expandable;

  return (
    <div
      className={cn("flex h-full w-full flex-col overflow-hidden", className)}
    >
      {/* Sticky header showing topmost visible item */}
      {hasItems && stickyHeaderContent && (
        <div className="flex-shrink-0">
          {stickyHeaderContent(topmostItem, topmostIndex)}
        </div>
      )}

      {/* Table header with column labels */}
      {hasItems && (
        <JSONTableViewHeader columns={columns} hasExpandIcon={hasExpandIcon} />
      )}

      {/* Virtualized list */}
      {hasItems && virtualized && (
        <div ref={parentRef} className="flex-1 overflow-y-scroll">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) return null;

              const key = getItemKey(item);
              const isExpanded = expandedKeys.has(key);

              return (
                <div
                  key={key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <JSONTableViewRow
                    item={item}
                    itemKey={key}
                    index={virtualRow.index}
                    columns={columns}
                    isExpanded={isExpanded}
                    expandable={expandable}
                    onToggle={() => handleToggle(key)}
                    renderExpanded={renderExpanded}
                    renderRowPrefix={renderRowPrefix}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Non-virtualized list */}
      {hasItems && !virtualized && (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {items.map((item, index) => {
            const key = getItemKey(item);
            const isExpanded = expandedKeys.has(key);

            return (
              <div key={key} data-row-index={index}>
                <JSONTableViewRow
                  item={item}
                  itemKey={key}
                  index={index}
                  columns={columns}
                  isExpanded={isExpanded}
                  expandable={expandable}
                  onToggle={() => handleToggle(key)}
                  renderExpanded={renderExpanded}
                  renderRowPrefix={renderRowPrefix}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasItems && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">No items</div>
        </div>
      )}
    </div>
  );
}
