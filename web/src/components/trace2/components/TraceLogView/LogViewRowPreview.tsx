/**
 * LogViewRowPreview - Collapsed state of a log view row.
 *
 * Displays observation metadata in a compact ~60px row.
 * Pure presentational component - receives all data via props.
 */

import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { ItemBadge } from "@/src/components/ItemBadge";
import { type TreeNode } from "@/src/components/trace2/lib/types";
import { type LogViewTreeStyle } from "./log-view-types";
import {
  formatDisplayName,
  formatRelativeTime,
  formatDepthIndicator,
  formatDuration,
} from "./log-view-formatters";

export interface LogViewRowPreviewProps {
  node: TreeNode;
  treeLines: boolean[];
  isLastSibling: boolean;
  treeStyle: LogViewTreeStyle;
  onExpand: () => void;
}

/**
 * Collapsed row showing observation metadata.
 * Fixed height for consistent virtualization estimates.
 */
export const LogViewRowPreview = memo(function LogViewRowPreview({
  node,
  treeLines,
  isLastSibling,
  treeStyle,
  onExpand,
}: LogViewRowPreviewProps) {
  const displayName = formatDisplayName(node);
  const relativeTime = formatRelativeTime(node.startTimeSinceTrace);
  const duration = formatDuration(node.startTime, node.endTime);
  const depthIndicator =
    treeStyle === "flat" ? formatDepthIndicator(node.depth) : "";

  // Count children for "X items" indicator
  const childrenCount = node.children?.length ?? 0;

  return (
    <div
      className="flex min-h-6 cursor-pointer items-center gap-2 border-b border-border bg-background px-3 py-0.5 hover:bg-muted/50"
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExpand();
        }
      }}
    >
      {/* Tree indentation (only in indented tree-order mode) */}
      {treeStyle === "indented" && node.depth > 0 && (
        <div className="flex flex-shrink-0">
          {treeLines.map((hasLine, index) => (
            <div key={index} className="relative w-3">
              {hasLine && (
                <div className="absolute bottom-0 left-1.5 top-0 w-px bg-border" />
              )}
            </div>
          ))}
          {/* Current level connector */}
          <div className="relative w-3">
            <div
              className={cn(
                "absolute left-1.5 top-0 w-px bg-border",
                isLastSibling ? "h-1/2" : "h-full",
              )}
            />
            <div className="absolute left-1.5 top-1/2 h-px w-1.5 bg-border" />
          </div>
        </div>
      )}

      {/* Expand icon */}
      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

      {/* Type badge */}
      <ItemBadge type={node.type} isSmall />

      {/* Name and metadata */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm">{displayName}</span>

        {/* Children count indicator */}
        {childrenCount > 0 && (
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {childrenCount} {childrenCount === 1 ? "item" : "items"}
          </span>
        )}

        {/* Depth indicator (flat mode only) */}
        {depthIndicator && (
          <span className="flex-shrink-0 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
            {depthIndicator}
          </span>
        )}
      </div>

      {/* Right-aligned columns: Depth, Duration, Time */}
      <span className="w-12 flex-shrink-0 text-right text-xs text-muted-foreground">
        {node.depth >= 0 ? `L${node.depth}` : "-"}
      </span>
      <span className="w-16 flex-shrink-0 text-right text-xs text-muted-foreground">
        {duration}
      </span>
      <span className="w-12 flex-shrink-0 text-right text-xs text-muted-foreground">
        {relativeTime}
      </span>
    </div>
  );
});
