/**
 * SearchListItem - Individual search result row
 *
 * Renders a single search result using ItemTypeIcon + SpanContent.
 * Reuses SpanContent from tree view for consistency.
 * Displays relative timestamps to show temporal context within the trace.
 */
import type { TraceSearchListItem as TraceSearchListItemData } from "@/src/features/traces/types/traceSearchListItem";

import { ItemTypeIcon } from "@/src/components/ItemBadge";
import { SpanContent } from "./SpanContent";
import { cn } from "@/src/utils/tailwind";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { formatIntervalSeconds } from "@/src/utils/dates";

interface TraceSearchListItemProps {
  item: TraceSearchListItemData;
  isSelected: boolean;
  onSelect: () => void;
  onHover?: () => void;
}

export function TraceSearchListItem({
  item,
  isSelected,
  onSelect,
  onHover,
}: TraceSearchListItemProps) {
  const { node, emphasis } = item;
  const { comments } = useTraceData();

  // Format relative timestamps
  const traceRelativeTime = formatIntervalSeconds(
    node.startTimeSinceTrace / 1000,
  );
  const parentRelativeTime =
    node.startTimeSinceParentStart !== null
      ? formatIntervalSeconds(node.startTimeSinceParentStart / 1000)
      : null;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "hover:bg-muted/50 flex cursor-pointer items-start px-2 py-1.5 transition-colors",
        isSelected && "bg-muted",
      )}
    >
      <div className="flex w-6 shrink-0 justify-center py-1.5">
        <div className="flex h-4 items-center">
          <ItemTypeIcon type={node.type} className="size-3.5" />
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <SpanContent
          node={node}
          emphasis={emphasis}
          commentCount={comments.get(node.id)}
          onSelect={onSelect}
        />
        {/* Temporal and depth context - only show for observations (not TRACE root) */}
        {node.type !== "TRACE" && (
          <div className="text-muted-foreground/70 pl-1 text-xs">
            depth {node.depth} • +{traceRelativeTime}
            {parentRelativeTime !== null &&
              ` • +${parentRelativeTime} from parent`}
          </div>
        )}
      </div>
    </div>
  );
}
