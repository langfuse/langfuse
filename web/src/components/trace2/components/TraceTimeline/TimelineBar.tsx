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
            "flex rounded-sm border border-border",
            isSelected
              ? "ring ring-primary-accent"
              : "group-hover:ring group-hover:ring-tertiary",
          )}
          style={{ marginLeft: `${startOffset}px` }}
        >
          {/* First token time bar (waiting period) */}
          <div
            className={cn(
              "flex h-8 items-center justify-start rounded-l-sm border-r border-gray-400 bg-muted opacity-60",
              itemWidth ? "" : "border border-dashed",
            )}
            style={{ width: `${firstTokenWidth}px` }}
          />

          {/* Completion time bar */}
          <div
            className={cn(
              "flex h-8 items-center justify-start rounded-r-sm bg-muted",
              itemWidth ? "" : "border border-dashed",
            )}
            style={{ width: `${completionWidth}px` }}
          >
            <div className="-ml-8 flex flex-row items-center justify-start gap-2 text-xs text-muted-foreground">
              <span className="text-xxs text-primary">First token</span>
              <ItemBadge type={node.type} isSmall />
              <span className="whitespace-nowrap text-sm font-medium text-primary">
                {node.name}
              </span>
              {showComments && commentCount ? (
                <CommentCountIcon count={commentCount} />
              ) : null}
              {showDuration && isPresent(latency) && (
                <span
                  className={cn(
                    "text-xs text-muted-foreground",
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
                    "text-xs text-muted-foreground",
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
            "flex h-8 items-center justify-start rounded-sm border border-border bg-muted",
            itemWidth ? "" : "border-dashed",
            isSelected
              ? "ring ring-primary-accent"
              : "group-hover:ring group-hover:ring-tertiary",
          )}
          style={{ width: `${itemWidth || 10}px` }}
        >
          <div
            className={cn(
              "flex flex-row items-center justify-start gap-2 text-xs text-muted-foreground",
              hasChildren ? "ml-6" : "ml-1",
            )}
          >
            <ItemBadge type={node.type} isSmall />
            <span className="whitespace-nowrap text-sm font-medium text-primary">
              {node.name}
            </span>
            {showComments && commentCount ? (
              <CommentCountIcon count={commentCount} />
            ) : null}
            {showDuration && isPresent(latency) && (
              <span
                className={cn(
                  "text-xs text-muted-foreground",
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
                  "text-xs text-muted-foreground",
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
