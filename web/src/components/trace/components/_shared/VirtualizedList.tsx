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
  overscan = 500,
}: VirtualizedListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedItemSize,
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
