/**
 * VirtualizedList - Generic virtualized list component
 *
 * Simpler than VirtualizedTree - no tree structure, just flat list virtualization.
 * Uses @tanstack/react-virtual for efficient rendering of large lists.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode } from "react";

interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (params: {
    item: T;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
  }) => ReactNode;
  selectedItemId?: string | null;
  onSelectItem: (id: string) => void;
  getItemId: (item: T) => string;
  estimatedItemSize?: number;
  overscan?: number;
}

export function VirtualizedList<T>({
  items,
  renderItem,
  selectedItemId,
  onSelectItem,
  getItemId,
  estimatedItemSize = 48,
  // overscan is a ROW COUNT, not pixels: keep it small so a long list mounts
  // only a few dozen extra rows per scroll step instead of ~1000 (the old "500"
  // mistook it for pixels). ~16 rows ≈ half a viewport of headroom.
  overscan = 16,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedItemSize,
    // Key the measurement cache by item id, matching the React key on each row.
    // Rows have dynamic heights (SpanContent wraps a node's score badges over
    // several lines) and the list filters/reorders as the search query changes.
    // Without this the cache is keyed by index, so a reordered row reuses the
    // previous occupant's measured height and the translateY offsets drift into
    // overlap (same failure as the tree — LFE-10591). Keying by id keeps each
    // measurement with its item.
    getItemKey: (index) => getItemId(items[index]!),
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          const itemId = getItemId(item);
          const isSelected = selectedItemId === itemId;

          return (
            <div
              key={itemId}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem({
                item,
                index: virtualRow.index,
                isSelected,
                onSelect: () => onSelectItem(itemId),
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
