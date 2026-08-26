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
import {
  CLUSTER_ITEM_GAP_PX,
  MAX_SCORE_GROUPS,
  commentIconWidth,
  createClusterFitter,
  scoreBadgesWidth,
} from "../../fns/timeline/metricCluster";

const SUBTREE_DURATION_TITLE =
  "Subtree wall-clock duration (first start → last end)";

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
  density,
}: TimelineBarProps) {
  // Room between the bar and a metric cluster outside it, and the inset of one
  // sitting inside: `density`'s own values, threaded in rather than copied. These
  // are the exact numbers `placeLabel()` measured the placement with, so a local
  // copy would be a silent desync waiting for the first change to density.
  const CLUSTER_GAP_PX = density.labelGapPx;
  const CLUSTER_INSET_PX = density.labelPaddingPx;
  const node = row.node;

  // `layout()` already applies the latency fallback (`hasDuration` covers it), so
  // a second one here could only ever run when latency is absent too. Wall-clock
  // subtree duration is surfaced only when async descendants outlive this node's
  // own span.
  const ownDurationMs = row.durationMs ?? undefined;
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
  // `hidden` means the DURATION LABEL fitted on neither side — not that neither
  // side has room. The cluster's other items are much narrower, so it goes to
  // whichever side is actually roomier instead of always falling in with
  // `after`, which in a lane like 137px is often the side with nothing left.
  const spaceBefore = Math.max(row.x - CLUSTER_GAP_PX, 0);
  const spaceAfter = Math.max(
    laneWidth - (row.x + row.width + CLUSTER_GAP_PX),
    0,
  );
  const placement =
    row.labelPlacement === "hidden" && spaceBefore > spaceAfter
      ? "before"
      : row.labelPlacement;

  const clusterStyle =
    placement === "before"
      ? {
          right: `${Math.max(laneWidth - row.x + CLUSTER_GAP_PX, 0)}px`,
          maxWidth: `${Math.max(row.x - CLUSTER_GAP_PX, 0)}px`,
        }
      : placement === "inside"
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
  const fitsWidth = createClusterFitter(budgetPx, CLUSTER_ITEM_GAP_PX);
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
  // Both are charged through the SAME running budget. Checking each against one
  // leftover let a comment icon and score badges both be admitted on the same
  // 48px, and their combined width then clipped the badges inside the cluster's
  // overflow box.
  const showCommentIcon =
    showComments &&
    Boolean(commentCount) &&
    fitsWidth(commentIconWidth(commentCount!, measurer));
  const showScoreBadges =
    showScores &&
    Boolean(scores?.length) &&
    fitsWidth(scoreBadgesWidth(scores!, measurer, MAX_SCORE_GROUPS));

  // Everything the row HAS stays reachable on hover when anything had to be
  // dropped — the icon and the badges included. They are admitted last, against
  // the smallest remaining budget, so they are the likeliest to go; without this
  // a narrow row simply did not mention that a comment or a score existed.
  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;
  const commentText =
    showComments && commentCount ? plural(commentCount, "comment") : null;
  const scoreText =
    showScores && scores?.length ? plural(scores.length, "score") : null;
  const droppedSomething =
    (durationText != null && !showDurationText) ||
    (subtreeText != null && !showSubtreeText) ||
    (costText != null && !showCostText) ||
    (commentText != null && !showCommentIcon) ||
    (scoreText != null && !showScoreBadges);
  const clusterTitle = droppedSomething
    ? [durationText, subtreeText, costText, commentText, scoreText]
        .filter(Boolean)
        .join("  ")
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
          <div className="flex max-h-5 gap-1" data-testid="timeline-bar-scores">
            {/* Not expandable here: the cluster's width was measured for exactly
                `MAX_SCORE_GROUPS` chips, so expanding in place would clip the
                chips already on screen instead of revealing the hidden ones. The
                hover preview shows them, and the row's title lists them. */}
            <GroupedScoreBadges
              scores={scores!}
              maxVisible={MAX_SCORE_GROUPS}
              expandable={false}
            />
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
        // When the lane is too narrow for even one item, the cluster is not drawn
        // at all — and the title listing what was dropped went with it, so the
        // narrowest rows were the ones that never mentioned their own comments or
        // scores. The bar is always there, so it carries the fallback.
        title={cluster ? undefined : clusterTitle}
        className={cn(
          "border-border absolute top-1/2 flex h-4 -translate-y-1/2 overflow-hidden rounded-sm border",
          // Dashed when in-flight (no measurable duration yet).
          row.durationMs == null && "border-dashed",
          // A clipped edge loses its rounding, so the bar reads as continuing.
          row.clippedLeft && "rounded-l-none",
          row.clippedRight && "rounded-r-none",
          ringClass,
        )}
        style={{ left: `${row.x}px`, width: `${row.width}px` }}
      >
        {/* Two SEGMENTS, and the ground belongs to them rather than to the
            frame: a translucent waiting segment over an opaque frame of the same
            colour composites straight back to that colour, so the wait and the
            completion read identically and only the divider says there was a
            split at all. */}
        {firstTokenWidth == null ? null : (
          <div
            className="bg-muted h-full border-r border-gray-400 opacity-60"
            style={{ width: `${firstTokenWidth}px` }}
            title="Time to first token"
          />
        )}
        <div className="bg-muted h-full flex-1" />
      </div>
      {cluster}
    </>
  );
}
