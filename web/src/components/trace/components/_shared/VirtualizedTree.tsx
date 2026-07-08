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
  // overscan is a ROW COUNT, not pixels: keep it small so a long tree mounts
  // only a few dozen extra rows per scroll step instead of ~1000 (the old "500"
  // mistook it for pixels). ~16 rows ≈ half a viewport of headroom.
  overscan = 16,
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
    // Key the measurement cache by node id, matching the React key on each row.
    // Rows have dynamic, wildly-varying heights (a node's score badges wrap into
    // several lines), and collapse/expand reorders the flattened list. Without
    // this the cache is keyed by index: on a reorder React reuses a row's DOM
    // element (same id) without resizing it, so the virtualizer never
    // re-measures and keeps the PREVIOUS node's height at that index — the
    // translateY offsets drift out of sync with the real heights and rows
    // overlap (LFE-10591, worst right after "Collapse all"). Keying by id makes
    // each measurement travel with its node, so offsets stay correct.
    getItemKey: (index) => flattenedItems[index]!.node.id,
    overscan,
    measureElement:
      typeof window !== "undefined"
        ? (element) => element.getBoundingClientRect().height
        : undefined,
  });

  // Scroll the selected node into view whenever the selection changes — so
  // selecting a node elsewhere (e.g. clicking it in the graph view) brings the
  // matching tree row into view. `align: "auto"` scrolls the minimum needed and
  // is a no-op when the row is already visible, so clicking a visible row never
  // jumps the list.
  const prevSelectedIdRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (!selectedNodeId || selectedNodeId === prevSelectedIdRef.current) {
      prevSelectedIdRef.current = selectedNodeId;
      return;
    }

    const index = flattenedItems.findIndex(
      (item) => item.node.id === selectedNodeId,
    );
    // Keep the scroll PENDING when the row is missing (collapsed subtree,
    // level filter) — the ref stays un-advanced, so this retries when
    // flattenedItems changes and the row appears.
    if (index === -1) return;

    const isInitial = prevSelectedIdRef.current === undefined;
    prevSelectedIdRef.current = selectedNodeId;

    // Initial load: center it instantly (no post-paint animation). Later
    // selection changes: minimal, smooth scroll only if it's off-screen.
    rowVirtualizer.scrollToIndex(index, {
      align: isInitial ? "center" : "auto",
      behavior: isInitial ? "auto" : "smooth",
    });
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
