import React from "react";
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { SpanItem } from "@/src/components/trace/SpanItem";
import { ItemBadge } from "@/src/components/ItemBadge";
import { type APIScoreV2 } from "@langfuse/shared";
import type Decimal from "decimal.js";
import { type TreeNode } from "./lib/types";

export interface TraceSearchListItem {
  node: TreeNode;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  observationId?: string; // The actual observation ID to use for navigation (undefined for TRACE nodes)
}

export interface TraceSearchListProps {
  items: TraceSearchListItem[];
  scores: APIScoreV2[];
  onSelect: (observationId: string | undefined) => void;
  comments?: Map<string, number>;
  showMetrics: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  showComments?: boolean;
  onClearSearch?: () => void;
}

export const TraceSearchList: React.FC<TraceSearchListProps> = ({
  items,
  scores,
  onSelect,
  comments,
  showMetrics,
  showScores,
  colorCodeMetrics,
  showComments = true,
  onClearSearch,
}) => {
  return (
    <div className="w-full">
      <CommandList className="max-h-none w-full overflow-x-hidden overflow-y-visible">
        <CommandGroup className="p-0">
          {items.map(
            ({ node, parentTotalCost, parentTotalDuration, observationId }) => (
              <CommandItem
                key={node.id}
                value={`${node.name} ${node.type} ${node.id}`}
                className="relative flex w-full !rounded-lg !py-1.5 px-2 hover:bg-muted/40 data-[selected=true]:!text-foreground"
                onSelect={() => onSelect(observationId)}
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
                      showMetrics={showMetrics}
                      showScores={showScores}
                      colorCodeMetrics={colorCodeMetrics}
                      parentTotalCost={parentTotalCost}
                      parentTotalDuration={parentTotalDuration}
                      showComments={showComments}
                    />
                  </div>
                </div>
              </CommandItem>
            ),
          )}
        </CommandGroup>
        <CommandEmpty>
          <div className="flex w-full justify-center">
            <div className="flex w-48 flex-col py-4 text-muted-foreground">
              <span className="mb-2 font-semibold">No results found</span>
              <span className="text-xs">
                Try searching by type, title, or id.
              </span>
            </div>
          </div>
        </CommandEmpty>
      </CommandList>
      {onClearSearch && items.length > 0 ? (
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
