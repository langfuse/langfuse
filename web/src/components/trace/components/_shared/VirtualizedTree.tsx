/**
 * Generic virtualized tree component using @tanstack/react-virtual.
 *
 * Renders large trees efficiently with dynamic row heights.
 * Uses render prop pattern for node customization.
 */

import { useRef, useLayoutEffect, useMemo, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { flattenTree } from "./tree-flattening";
import { cn } from "@/src/utils/tailwind";
import { type TreeNodeMetadata } from "./VirtualizedTreeNodeWrapper";

interface VirtualizedTreeProps<T extends { id: string; children: T[] }> {
  roots: T[];
  collapsedNodes: Set<string>;
  selectedNodeId: string | null;
  renderNode: (params: {
    node: T;
    treeMetadata: TreeNodeMetadata;
    isSelected: boolean;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onSelect: () => void;
  }) => ReactNode;
  onToggleCollapse: (nodeId: string) => void;
  onSelectNode: (nodeId: string | null) => void;
  estimateSize?: (node: T, index: number) => number;
  overscan?: number;
  defaultRowHeight?: number;
  className?: string;
}

export function VirtualizedTree<T extends { id: string; children: T[] }>({
  roots,
  collapsedNodes,
  selectedNodeId,
  renderNode,
  onToggleCollapse,
  onSelectNode,
  estimateSize,
  overscan = 500,
  defaultRowHeight = 37,
  className,
}: VirtualizedTreeProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const flattenedItems = useMemo(
    () => flattenTree(roots, collapsedNodes),
    [roots, collapsedNodes],
  );

  const defaultEstimateSize = () => defaultRowHeight;

  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateSize
      ? (index) => estimateSize(flattenedItems[index]!.node, index)
      : defaultEstimateSize,
    overscan,
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  // Auto-scroll to selected node on initial load (URL-based navigation only)
  const initialNodeIdRef = useRef(selectedNodeId);
  const hasScrolledRef = useRef(false);

  useLayoutEffect(() => {
    if (
      selectedNodeId &&
      !hasScrolledRef.current &&
      selectedNodeId === initialNodeIdRef.current
    ) {
      const index = flattenedItems.findIndex(
        (item) => item.node.id === selectedNodeId,
      );

      if (index !== -1) {
        // Use behavior: "auto" for instant scroll on initial load to prevent
        // visible scroll animation after page render. The synchronous scroll
        // completes within useLayoutEffect, before browser paint.
        rowVirtualizer.scrollToIndex(index, {
          align: "center",
          behavior: "auto",
        });
        hasScrolledRef.current = true;
      }
    }
  }, [selectedNodeId, flattenedItems, rowVirtualizer]);

  return (
    <div ref={parentRef} className={cn("h-full overflow-y-auto", className)}>
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = flattenedItems[virtualRow.index]!;
          const isSelected = item.node.id === selectedNodeId;
          const isCollapsed = collapsedNodes.has(item.node.id);

          return (
            <div
              key={item.node.id}
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
              {renderNode({
                node: item.node,
                treeMetadata: {
                  depth: item.depth,
                  treeLines: item.treeLines,
                  isLastSibling: item.isLastSibling,
                },
                isSelected,
                isCollapsed,
                onToggleCollapse: () => onToggleCollapse(item.node.id),
                onSelect: () => onSelectNode(item.node.id),
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
