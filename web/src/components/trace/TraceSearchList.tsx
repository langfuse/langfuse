import React, { useRef } from "react";
import { SpanItem } from "@/src/components/trace/SpanItem";
import { ItemBadge } from "@/src/components/ItemBadge";
import { type ScoreDomain } from "@langfuse/shared";
import type Decimal from "decimal.js";
import { type TreeNode } from "./lib/types";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface TraceSearchListItem {
  node: TreeNode;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  observationId?: string; // The actual observation ID to use for navigation (undefined for TRACE nodes)
}

export interface TraceSearchListProps {
  items: TraceSearchListItem[];
  displayScores: WithStringifiedMetadata<ScoreDomain>[];
  onSelect: (observationId: string | undefined) => void;
  comments?: Map<string, number>;
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  showComments?: boolean;
  onClearSearch?: () => void;
}

// Individual search list row component for virtualization
type SearchListRowProps = {
  item: TraceSearchListItem;
  scores: WithStringifiedMetadata<ScoreDomain>[];
  onSelect: (observationId: string | undefined) => void;
  comments?: Map<string, number>;
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  showComments: boolean;
};

const SearchListRow: React.FC<SearchListRowProps> = ({
  item,
  scores,
  onSelect,
  comments,
  showDuration,
  showCostTokens,
  showScores,
  colorCodeMetrics,
  showComments,
}) => {
  const { node, parentTotalCost, parentTotalDuration, observationId } = item;

  return (
    <div
      className="relative flex w-full cursor-pointer !rounded-lg !py-1.5 px-2 hover:bg-muted/40"
      onClick={() => onSelect(observationId)}
    >
      <div className="flex w-full">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="relative z-20 flex-shrink-0">
            <ItemBadge type={node.type} isSmall className="!size-3" />
          </div>
          <SpanItem
            node={node}
            scores={scores}
            comments={comments}
            showDuration={showDuration}
            showCostTokens={showCostTokens}
            showScores={showScores}
            colorCodeMetrics={colorCodeMetrics}
            parentTotalCost={parentTotalCost}
            parentTotalDuration={parentTotalDuration}
            showComments={showComments}
          />
        </div>
      </div>
    </div>
  );
};

export const TraceSearchList: React.FC<TraceSearchListProps> = ({
  items,
  // Note: displayScores are merged with client-side score cache; handling optimistic updates
  displayScores: scores,
  onSelect,
  comments,
  showDuration,
  showCostTokens,
  showScores,
  colorCodeMetrics,
  showComments = true,
  onClearSearch,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Set up virtualizer
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // Approximate height of a search result row
    overscan: 50, // Render 50 extra rows above/below viewport for smooth scrolling
  });

  // Handle empty state
  if (items.length === 0) {
    return (
      <div className="w-full">
        <div className="flex w-full justify-center">
          <div className="flex w-48 flex-col py-4 text-muted-foreground">
            <span className="mb-2 font-semibold">No results found</span>
            <span className="text-xs">
              Try searching by type, title, or id.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Virtualized search results */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <div
                key={item.node.id}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <SearchListRow
                  item={item}
                  scores={scores}
                  onSelect={onSelect}
                  comments={comments}
                  showDuration={showDuration}
                  showCostTokens={showCostTokens}
                  showScores={showScores}
                  colorCodeMetrics={colorCodeMetrics}
                  showComments={showComments}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Clear search button */}
      {onClearSearch ? (
        <button
          type="button"
          className="mt-1 inline-flex w-full items-center justify-center rounded-lg px-2 py-1 text-xs hover:bg-muted/70"
          onClick={() => onClearSearch?.()}
        >
          Clear search
        </button>
      ) : null}
    </div>
  );
};
