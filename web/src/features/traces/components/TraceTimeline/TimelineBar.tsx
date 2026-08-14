/**
 * TimelineBar - Renders the gantt bar for a node on the time track.
 *
 * Pure time-coordinate concern: a colored duration box positioned at the node's
 * start offset, followed by a trailing metric label. Identity (badge, name) and
 * hierarchy (tree connectors) live in the gutter (TimelineGutterRow) — not here — so
 * the bar can sit at its true time position without dragging the tree with it.
 *
 * Every coordinate arrives already computed from `layout()`, including WHICH SIDE
 * of the bar the metric cluster goes on. That decision used to belong to CSS
 * flow, which cannot see the lane's width and so pushed the cluster off-screen
 * in a narrow lane; the lane no longer scrolls horizontally, so off-screen means
 * gone. See fns/timeline/layout.ts.
 */

import { type TimelineBarProps } from "./types";
import { cn } from "@/src/utils/tailwind";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";
import { getSubtreeDurationOverflowMs } from "@/src/features/traces/fns/getSubtreeDurationOverflowMs";
import { heatMapTextColor } from "@/src/features/traces/fns/heatMapTextColor";
import { isPresent } from "@langfuse/shared";

const SUBTREE_DURATION_TITLE =
  "Subtree wall-clock duration (first start → last end)";

// Room between the bar and a metric cluster sitting outside it.
const CLUSTER_GAP_PX = 6;
const CLUSTER_INSET_PX = 4;
// Icons carry no text to measure, so they get a flat reservation.
const ICON_WIDTH_PX = 22;
const SCORE_BADGES_WIDTH_PX = 48;

export function TimelineBar({
  row,
  laneWidth,
  measurer,
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
  const node = row.node;

  // Own-span basis mirrors SpanContent: fall back to node.latency when there's
  // no endTime (e.g. the synthetic v4 trace-root span) so tree and timeline
  // agree. Wall-clock subtree duration is surfaced only when async descendants
  // outlive this node's own span (LFE-10475).
  const ownDurationMs =
    row.durationMs ?? (node.latency ? node.latency * 1000 : undefined);
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

  // Which side the metric cluster lands on is layout()'s call, made against the
  // measured lane; we only turn it into a position. `hidden` means neither side
  // had room, so nothing is drawn rather than something drawn off the lane.
  const clusterStyle =
    row.labelPlacement === "before"
      ? {
          right: `${Math.max(laneWidth - row.x + CLUSTER_GAP_PX, 0)}px`,
          maxWidth: `${Math.max(row.x - CLUSTER_GAP_PX, 0)}px`,
        }
      : row.labelPlacement === "inside"
        ? {
            left: `${row.x + CLUSTER_INSET_PX}px`,
            maxWidth: `${Math.max(row.width - CLUSTER_INSET_PX * 2, 0)}px`,
          }
        : {
            left: `${row.x + row.width + CLUSTER_GAP_PX}px`,
            maxWidth: `${Math.max(
              laneWidth - (row.x + row.width + CLUSTER_GAP_PX),
              0,
            )}px`,
          };

  // layout() measures the duration; the optional metrics are this component's
  // own content, so it fits them here with the SAME measurer rather than
  // letting them clip mid-glyph at the lane edge. Highest priority first: a
  // duration always beats a cost you cannot finish reading.
  const budgetPx = Number.parseFloat(clusterStyle.maxWidth);
  let spentPx = 0;
  /** Admit a piece of the cluster, or refuse it — and charge it if admitted. */
  const fitsWidth = (widthPx: number) => {
    const next = spentPx + widthPx + CLUSTER_GAP_PX;
    if (next > budgetPx) return false;
    spentPx = next;
    return true;
  };
  const fitsCluster = (text: string) => fitsWidth(measurer.measure(text));

  // The layout measured this exact string, which is why the bar renders it
  // rather than formatting the duration a second time: two formatters disagree
  // above an hour, and the side layout() chose was chosen for the shorter one.
  const durationText = showDuration && row.label ? row.label : null;
  const subtreeText =
    isPresent(ownDurationMs) && subtreeWallClockOverflowMs != null
      ? `∑ ${formatIntervalSeconds(subtreeWallClockOverflowMs / 1000)}`
      : null;
  const costText =
    showCostTokens && node.totalCost
      ? usdFormatter(node.totalCost.toNumber())
      : null;

  // `hidden` is layout()'s verdict on the DURATION LABEL — neither side of the
  // bar had room for it, or there is no duration to show yet. It is not a verdict
  // on the icons, which are much narrower and may well fit.
  const showDurationText =
    durationText != null &&
    row.labelPlacement !== "hidden" &&
    fitsCluster(durationText);
  const showSubtreeText = subtreeText != null && fitsCluster(subtreeText);
  const showCostText = costText != null && fitsCluster(costText);
  // Icons carry no text to measure, so they get a flat reservation — charged
  // through the SAME running budget. Checking both against one leftover let a
  // comment icon and score badges each be admitted on the same 48px, and their
  // combined width then clipped the badges inside the cluster's overflow box.
  const showCommentIcon =
    showComments && Boolean(commentCount) && fitsWidth(ICON_WIDTH_PX);
  const showScoreBadges =
    showScores && Boolean(scores?.length) && fitsWidth(SCORE_BADGES_WIDTH_PX);

  // The full text stays reachable on hover when something had to be dropped.
  const droppedSomething =
    (durationText != null && !showDurationText) ||
    (subtreeText != null && !showSubtreeText) ||
    (costText != null && !showCostText);
  const clusterTitle = droppedSomething
    ? [durationText, subtreeText, costText].filter(Boolean).join("  ")
    : undefined;

  // Draw the cluster when it has something in it. Gating it on the duration
  // label's placement hid the comment icon, the cost and the scores of every
  // in-flight span — which never has a duration label — however much room the
  // lane had for them.
  const cluster =
    !showDurationText &&
    !showSubtreeText &&
    !showCostText &&
    !showCommentIcon &&
    !showScoreBadges ? null : (
      <div
        className="text-muted-foreground absolute top-1/2 flex -translate-y-1/2 items-center gap-2 overflow-hidden text-xs whitespace-nowrap"
        style={clusterStyle}
        title={clusterTitle}
      >
        {showCommentIcon ? <CommentCountIcon count={commentCount!} /> : null}
        {showDurationText && (
          <span
            className={cn(
              parentTotalDuration &&
                colorCodeMetrics &&
                heatMapTextColor({
                  max: parentTotalDuration,
                  value: ownDurationMs!,
                }),
            )}
          >
            {durationText}
          </span>
        )}
        {showSubtreeText && (
          <span title={SUBTREE_DURATION_TITLE}>{subtreeText}</span>
        )}
        {showCostText && (
          <span
            className={cn(
              parentTotalCost &&
                colorCodeMetrics &&
                heatMapTextColor({
                  max: parentTotalCost,
                  value: node.totalCost!,
                }),
            )}
          >
            {costText}
          </span>
        )}
        {showScoreBadges && (
          <div className="flex max-h-5 gap-1">
            <GroupedScoreBadges scores={scores!} maxVisible={3} />
          </div>
        )}
      </div>
    );

  // Streaming LLMs (first token time) split the bar: waiting segment, then
  // completion. firstTokenX is null when the marker falls outside the lane.
  const firstTokenWidth =
    row.firstTokenX == null
      ? null
      : Math.min(Math.max(row.firstTokenX - row.x, 0), row.width);

  return (
    <>
      <div
        className={cn(
          "border-border bg-muted absolute top-1/2 flex h-4 -translate-y-1/2 overflow-hidden rounded-sm border",
          // Dashed when in-flight (no measurable duration yet).
          row.durationMs == null && "border-dashed",
          // A clipped edge loses its rounding, so the bar reads as continuing.
          row.clippedLeft && "rounded-l-none",
          row.clippedRight && "rounded-r-none",
          ringClass,
        )}
        style={{ left: `${row.x}px`, width: `${row.width}px` }}
      >
        {firstTokenWidth == null ? null : (
          <div
            className="bg-muted h-full border-r border-gray-400 opacity-60"
            style={{ width: `${firstTokenWidth}px` }}
            title="Time to first token"
          />
        )}
      </div>
      {cluster}
    </>
  );
}
