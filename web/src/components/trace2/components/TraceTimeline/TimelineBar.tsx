/**
 * TimelineBar - Renders individual Gantt bar for a node
 * Shows duration visually with colored box, displays name, badges, and metrics
 */

import { type TimelineBarProps } from "./types";
import { cn } from "@/src/utils/tailwind";
import { ItemBadge } from "@/src/components/ItemBadge";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";
import { heatMapTextColor } from "@/src/components/trace2/lib/helpers";
import { isPresent } from "@langfuse/shared";

export function TimelineBar({
  node,
  metrics,
  isSelected,
  onSelect,
  onHover,
  showDuration,
  showCostTokens,
  showScores,
  showComments,
  colorCodeMetrics,
  parentTotalCost,
  parentTotalDuration,
  commentCount,
  scores,
}: TimelineBarProps) {
  const { startOffset, itemWidth, firstTokenTimeOffset, latency } = metrics;
  const duration = latency ? latency * 1000 : undefined;
  const hasChildren = node.children.length > 0;

  // Render split bar for streaming LLMs (first token time)
  if (firstTokenTimeOffset) {
    const firstTokenWidth = firstTokenTimeOffset - startOffset;
    const completionWidth = itemWidth - firstTokenWidth;

    return (
      <div
        className="group my-0.5 flex w-full min-w-fit cursor-pointer flex-row items-center"
        onClick={onSelect}
        onMouseEnter={onHover}
      >
        <div
          className={cn(
            "border-border flex rounded-sm border",
            isSelected
              ? "ring-primary-accent ring-3"
              : "group-hover:ring-tertiary group-hover:ring-3",
          )}
          style={{ marginLeft: `${startOffset}px` }}
        >
          {/* First token time bar (waiting period) */}
          <div
            className={cn(
              "bg-muted flex h-8 items-center justify-start rounded-l-sm border-r border-gray-400 opacity-60",
              itemWidth ? "" : "border border-dashed",
            )}
            style={{ width: `${firstTokenWidth}px` }}
          />

          {/* Completion time bar */}
          <div
            className={cn(
              "bg-muted flex h-8 items-center justify-start rounded-r-sm",
              itemWidth ? "" : "border border-dashed",
            )}
            style={{ width: `${completionWidth}px` }}
          >
            <div className="text-muted-foreground -ml-8 flex flex-row items-center justify-start gap-2 text-xs">
              <span className="text-xxs text-primary">First token</span>
              <ItemBadge type={node.type} isSmall />
              <span className="text-primary text-sm font-medium whitespace-nowrap">
                {node.name}
              </span>
              {showComments && commentCount ? (
                <CommentCountIcon count={commentCount} />
              ) : null}
              {showDuration && isPresent(latency) && (
                <span
                  className={cn(
                    "text-muted-foreground text-xs",
                    parentTotalDuration &&
                      colorCodeMetrics &&
                      duration &&
                      heatMapTextColor({
                        max: parentTotalDuration,
                        value: duration,
                      }),
                  )}
                >
                  {formatIntervalSeconds(latency)}
                </span>
              )}
              {showCostTokens && node.totalCost && (
                <span
                  className={cn(
                    "text-muted-foreground text-xs",
                    parentTotalCost &&
                      colorCodeMetrics &&
                      heatMapTextColor({
                        max: parentTotalCost,
                        value: node.totalCost,
                      }),
                  )}
                >
                  {usdFormatter(node.totalCost.toNumber())}
                </span>
              )}
              {showScores && scores && scores.length > 0 && (
                <div className="flex max-h-8 gap-1">
                  <GroupedScoreBadges scores={scores} maxVisible={3} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular bar (no first token time)
  return (
    <div
      className="group my-0.5 flex w-full min-w-fit cursor-pointer flex-row items-center"
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <div className="relative" style={{ marginLeft: `${startOffset}px` }}>
        <div
          className={cn(
            "border-border bg-muted flex h-8 items-center justify-start rounded-sm border",
            itemWidth ? "" : "border-dashed",
            isSelected
              ? "ring-primary-accent ring-3"
              : "group-hover:ring-tertiary group-hover:ring-3",
          )}
          style={{ width: `${itemWidth || 10}px` }}
        >
          <div
            className={cn(
              "text-muted-foreground flex flex-row items-center justify-start gap-2 text-xs",
              hasChildren ? "ml-6" : "ml-1",
            )}
          >
            <ItemBadge type={node.type} isSmall />
            <span className="text-primary text-sm font-medium whitespace-nowrap">
              {node.name}
            </span>
            {showComments && commentCount ? (
              <CommentCountIcon count={commentCount} />
            ) : null}
            {showDuration && isPresent(latency) && (
              <span
                className={cn(
                  "text-muted-foreground text-xs",
                  parentTotalDuration &&
                    colorCodeMetrics &&
                    duration &&
                    heatMapTextColor({
                      max: parentTotalDuration,
                      value: duration,
                    }),
                )}
              >
                {formatIntervalSeconds(latency)}
              </span>
            )}
            {showCostTokens && node.totalCost && (
              <span
                className={cn(
                  "text-muted-foreground text-xs",
                  parentTotalCost &&
                    colorCodeMetrics &&
                    heatMapTextColor({
                      max: parentTotalCost,
                      value: node.totalCost,
                    }),
                )}
              >
                {usdFormatter(node.totalCost.toNumber())}
              </span>
            )}
            {showScores && scores && scores.length > 0 && (
              <div className="flex max-h-8 gap-1">
                <GroupedScoreBadges scores={scores} maxVisible={3} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
