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
import {
  GroupedScoreBadges,
  groupScoresByName,
} from "@/src/components/grouped-score-badge";
import {
  SCORE_LEVEL_LABELS,
  scoreLevelFromScore,
} from "@/src/components/score-tag";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";
import { getSubtreeDurationOverflowMs } from "@/src/features/traces/fns/getSubtreeDurationOverflowMs";
import { heatMapTextColor } from "@/src/features/traces/fns/heatMapTextColor";
import { isPresent } from "@langfuse/shared";

const SUBTREE_DURATION_TITLE =
  "Subtree wall-clock duration (first start → last end)";

/**
 * The cluster's own `gap-2`. The budget has to reserve the gap the cluster
 * actually renders with, not a smaller one: five admitted items multiply a 2px
 * under-reservation into a clipped last item.
 */
const CLUSTER_ITEM_GAP_PX = 8;
// An icon carries no text to measure, so it gets a flat reservation.
const ICON_WIDTH_PX = 22;
/** `px-2.5` both sides plus the 1px border of a score chip. */
const SCORE_CHIP_CHROME_PX = 22;
/** `max-w-20` truncates a score's name. */
const SCORE_NAME_MAX_PX = 80;
/** The gap between a chip's name and its values. */
const SCORE_NAME_GAP_PX = 4;
/**
 * One `size-3` icon plus its gap. A value can carry BOTH a comment and metadata,
 * and they render as two separate icons.
 */
const SCORE_VALUE_ICON_PX = 16;
/** `px-1` both sides of a ScoreTag level pill; the label itself is measured. */
const SCORE_PILL_CHROME_PX = 8;
/** The "+N" button for groups past `maxVisible`. */
const SCORE_OVERFLOW_PX = 28;
/** `gap-1` on the score-badges wrapper — not the cluster's own `gap-2`. */
const SCORE_GROUP_GAP_PX = 4;

/**
 * What `GroupedScoreBadges` will actually take, measured rather than guessed.
 *
 * A flat 48px reservation was the bug: two real scores render 100-300px, so a
 * leftover budget anywhere in between admitted the badges and then let the
 * cluster's overflow box cut them mid-glyph — exactly the clipping this layout
 * exists to remove, in exactly the narrow lanes it targets. The widest groups are
 * priced, because over-reserving drops a badge (recoverable, and the title says
 * so) while under-reserving clips one (not recoverable).
 */
function scoreBadgesWidth(
  scores: NonNullable<TimelineBarProps["scores"]>,
  measurer: TimelineBarProps["measurer"],
  maxVisible: number,
): number {
  // Bucketed by the badges' own grouping rule, so this cannot price a chip that
  // never renders — or miss one that does.
  const groups = Object.entries(groupScoresByName(scores));
  // Level pills appear only when the row MIXES levels; a row whose scores share
  // one level needs no per-chip disambiguation. Same rule the badges use.
  const mixesLevels =
    new Set(scores.map((score) => scoreLevelFromScore(score))).size > 1;

  const widths = groups
    .map(([name, group]) => {
      const values = group.map(
        (score) => score.stringValue ?? score.value?.toFixed(2) ?? "",
      );
      // A comment and metadata are two separate icons, so they are two
      // reservations — counting "either" under-prices a value carrying both.
      const icons =
        group.filter((score) => score.comment).length +
        group.filter((score) => score.metadata).length;
      // The pill spells its level out ("Observation" is not "Trace"), so it is
      // measured rather than assumed.
      const levels = mixesLevels
        ? [...new Set(group.map((score) => scoreLevelFromScore(score)))]
        : [];
      const pills = levels.reduce(
        (total, level) =>
          total +
          measurer.measure(SCORE_LEVEL_LABELS[level]) +
          SCORE_PILL_CHROME_PX,
        0,
      );
      return (
        Math.min(measurer.measure(`${name}:`), SCORE_NAME_MAX_PX) +
        SCORE_NAME_GAP_PX +
        measurer.measure(values.join(" ")) +
        icons * SCORE_VALUE_ICON_PX +
        pills +
        SCORE_CHIP_CHROME_PX
      );
    })
    .sort((a, b) => b - a)
    .slice(0, maxVisible);

  // Groups past the cap collapse into a "+N" button, which is also width.
  const overflow = groups.length > maxVisible ? SCORE_OVERFLOW_PX : 0;
  return widths.reduce(
    (total, width, index) =>
      total + width + (index > 0 ? SCORE_GROUP_GAP_PX : 0),
    overflow,
  );
}

/** How many score groups the cluster shows before the rest are hidden. */
const MAX_SCORE_GROUPS = 3;

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
  let spentPx = 0;
  /**
   * Admit a piece of the cluster, or refuse it — and charge it if admitted. The
   * flex gap sits BETWEEN children, so the first item is charged none: billing it
   * for a gap it does not have rejected content that renders perfectly well
   * alone (a 32px duration against a 39px budget).
   */
  const fitsWidth = (widthPx: number) => {
    const next = spentPx + widthPx + (spentPx > 0 ? CLUSTER_ITEM_GAP_PX : 0);
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
          <div className="flex max-h-5 gap-1">
            <GroupedScoreBadges
              scores={scores!}
              maxVisible={MAX_SCORE_GROUPS}
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
