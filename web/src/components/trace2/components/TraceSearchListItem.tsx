/**
 * SearchListItem - Individual search result row
 *
 * Renders a single search result using ItemBadge + SpanContent.
 * Reuses SpanContent from tree view for consistency.
 */

import { type TraceSearchListItem } from "../lib/types";
import { ItemBadge } from "@/src/components/ItemBadge";
import { SpanContent } from "./SpanContent";
import { cn } from "@/src/utils/tailwind";

interface TraceSearchListItemProps {
  item: TraceSearchListItem;
  isSelected: boolean;
  onSelect: () => void;
}

export function TraceSearchListItem({
  item,
  isSelected,
  onSelect,
}: TraceSearchListItemProps) {
  const { node, parentTotalCost, parentTotalDuration } = item;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors hover:bg-muted/50",
        isSelected && "bg-muted",
      )}
    >
      <ItemBadge type={node.type} />
      <div className="min-w-0 flex-1">
        <SpanContent
          node={node}
          parentTotalCost={parentTotalCost}
          parentTotalDuration={parentTotalDuration}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
