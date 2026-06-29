/**
 * TimelineBar - Renders the gantt bar for a node on the time track.
 *
 * Pure time-coordinate concern: a colored duration box positioned at the node's
 * start offset, followed by a trailing metric label. Identity (badge, name) and
 * hierarchy (tree connectors) live in the gutter (TimelineGutterRow) — not here — so
 * the bar can sit at its true time position without dragging the tree with it.
 */

import { type TimelineBarProps } from "./types";
import { cn } from "@/src/utils/tailwind";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";
import {
  heatMapTextColor,
  getSubtreeDurationOverflowMs,
} from "@/src/components/trace/lib/helpers";
import { isPresent } from "@langfuse/shared";

const SUBTREE_DURATION_TITLE =
  "Subtree wall-clock duration (first start → last end)";

// Keep zero/near-zero-duration spans visible as a small marker.
const MIN_BAR_WIDTH = 4;

export function TimelineBar({
  node,
  metrics,
  isSelected,
  isHovered,
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

  // Own-span basis mirrors SpanContent: fall back to node.latency when there's
  // no endTime (e.g. the synthetic v4 trace-root span) so tree and timeline
  // agree. Wall-clock subtree duration is surfaced only when async descendants
  // outlive this node's own span (LFE-10475).
  const ownDurationMs =
    duration ?? (node.latency ? node.latency * 1000 : undefined);
  const subtreeWallClockOverflowMs = showDuration
    ? getSubtreeDurationOverflowMs(
        ownDurationMs,
        node.subtreeWallClockDurationMs,
      )
    : null;

  // Ring driven by shared row state (not group-hover) so it lights up whether
  // the chart bar or the caption is hovered.
  const ringClass = isSelected
    ? "ring-primary-accent ring-2"
    : isHovered
      ? "ring-tertiary ring-2"
      : "";

  // Trailing label: rides just after the bar so metrics stay readable no matter
  // how thin the bar is. Respects the same view toggles as the tree.
  const label = (
    <div className="text-muted-foreground flex items-center gap-2 text-xs whitespace-nowrap">
      {showComments && commentCount ? (
        <CommentCountIcon count={commentCount} />
      ) : null}
      {showDuration && isPresent(ownDurationMs) && (
        <span
          className={cn(
            parentTotalDuration &&
              colorCodeMetrics &&
              heatMapTextColor({
                max: parentTotalDuration,
                value: ownDurationMs,
              }),
          )}
        >
          {formatIntervalSeconds(ownDurationMs / 1000)}
        </span>
      )}
      {isPresent(ownDurationMs) && subtreeWallClockOverflowMs != null && (
        <span title={SUBTREE_DURATION_TITLE}>
          {"∑ "}
          {formatIntervalSeconds(subtreeWallClockOverflowMs / 1000)}
        </span>
      )}
      {showCostTokens && node.totalCost && (
        <span
          className={cn(
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
        <div className="flex max-h-5 gap-1">
          <GroupedScoreBadges scores={scores} maxVisible={3} />
        </div>
      )}
    </div>
  );

  // Split bar for streaming LLMs (first token time): waiting segment + completion.
  if (firstTokenTimeOffset) {
    const firstTokenWidth = Math.max(firstTokenTimeOffset - startOffset, 0);
    const completionWidth = Math.max(
      itemWidth - firstTokenWidth,
      MIN_BAR_WIDTH,
    );

    return (
      <div
        className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2"
        style={{ left: `${startOffset}px` }}
      >
        <div
          className={cn(
            "border-border flex h-4 overflow-hidden rounded-sm border",
            // Dashed when in-flight (no width yet), matching the non-streaming bar.
            itemWidth ? "" : "border-dashed",
            ringClass,
          )}
        >
          <div
            className="bg-muted h-full border-r border-gray-400 opacity-60"
            style={{ width: `${firstTokenWidth}px` }}
            title="Time to first token"
          />
          <div
            className="bg-muted h-full"
            style={{ width: `${completionWidth}px` }}
          />
        </div>
        {label}
      </div>
    );
  }

  return (
    <div
      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2"
      style={{ left: `${startOffset}px` }}
    >
      <div
        className={cn(
          "border-border bg-muted h-4 rounded-sm border",
          itemWidth ? "" : "border-dashed",
          ringClass,
        )}
        style={{ width: `${Math.max(itemWidth, MIN_BAR_WIDTH)}px` }}
      />
      {label}
    </div>
  );
}
