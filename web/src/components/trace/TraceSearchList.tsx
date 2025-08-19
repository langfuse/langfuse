import React from "react";
import {
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/src/components/ui/command";
import { SpanItem } from "@/src/components/trace/SpanItem";
import { type APIScoreV2 } from "@langfuse/shared";
import type Decimal from "decimal.js";
import { type TreeNode } from "./lib/types";

export interface TraceSearchListItem {
  node: TreeNode;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
}

export interface TraceSearchListProps {
  items: TraceSearchListItem[];
  scores: APIScoreV2[];
  onSelect: (id: string) => void;
  comments?: Map<string, number>;
  showMetrics: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  showComments?: boolean;
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
}) => {
  return (
    <div className="h-full w-full">
      <CommandList className="h-full max-h-none w-full overflow-x-hidden overflow-y-visible">
        <CommandGroup>
          {items.map(({ node, parentTotalCost, parentTotalDuration }) => (
            <CommandItem
              key={node.id}
              value={`${node.name} ${node.type} ${node.id}`}
              className="relative flex w-full rounded-md px-0 hover:rounded-lg"
              onSelect={() => onSelect(node.id)}
            >
              <div className="flex w-full">
                <div className="flex min-w-0 flex-1 items-start gap-2 py-1">
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
          ))}
        </CommandGroup>
      </CommandList>
    </div>
  );
};
