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
/** The speech bubble of a comment icon, plus its own `mr-1`. */
const ICON_GLYPH_PX = 20;
/** Its count badge overlaps the bubble by `-ml-2`, so only the rest is width. */
const ICON_BADGE_OVERLAP_PX = 7;
/** `px-[0.2rem]` both sides plus the badge's 1px border. */
const ICON_BADGE_CHROME_PX = 8;
/** `min-w-[0.8rem]` floors a single digit. */
const ICON_BADGE_MIN_PX = 12;

/**
 * A comment icon is its bubble plus a count badge, and the badge grows with the
 * count — 99 comments is wider than 9, and "99+" wider again. A flat number for
 * "an icon" under-reserved every 2-digit count, which is the direction that
 * clips: the badge is in the flow now, so what it takes is what it takes.
 *
 * The digits are measured at the cluster's own font, a little larger than the
 * badge's `text-[8px]`, which over-reserves by a px or two and never under.
 */
function commentIconWidth(
  count: number,
  measurer: TimelineBarProps["measurer"],
): number {
  const label = count > 99 ? "99+" : String(count);
  const badge = Math.max(
    measurer.measure(label) + ICON_BADGE_CHROME_PX,
    ICON_BADGE_MIN_PX,
  );
  return ICON_GLYPH_PX - ICON_BADGE_OVERLAP_PX + badge;
}
/** `px-2.5` both sides plus the 1px border of a score chip. */
const SCORE_CHIP_CHROME_PX = 22;
/** `max-w-20` truncates a score's name. */
const SCORE_NAME_MAX_PX = 80;
/** `gap-1`, which a score chip applies between EVERY one of its flex children. */
const SCORE_GAP_PX = 4;
/** `gap-1` plus the value span's own `ml-1`, between two values of one name. */
const SCORE_VALUE_SEPARATOR_PX = 8;
/**
 * One `size-3` icon plus its gap, rounded up (the app's root font scale makes a
 * `size-3` 10.8px). A value can carry BOTH a comment and metadata, and they
 * render as two separate icons.
 */
const SCORE_VALUE_ICON_PX = 16;
/** `px-1` both sides of a ScoreTag level pill; the label itself is measured. */
const SCORE_PILL_CHROME_PX = 8;
/** `px-1` both sides of the "+N" button for groups past `maxVisible`. */
const SCORE_OVERFLOW_CHROME_PX = 8;
/**
 * The button renders `font-bold`, which sets wider than the regular-weight probe
 * the measurer is seeded from. Small, but it is width, and unpaid width clips.
 */
const SCORE_OVERFLOW_BOLD_PX = 2;
/** `gap-1` on the score-badges wrapper — not the cluster's own `gap-2`. */
export const SCORE_GROUP_GAP_PX = 4;

/**
 * The trailing "+N" button, plus the `gap-1` before it. Its digits are measured
 * because a flat number for it under-priced every count past 9 — a node can
 * carry a dozen distinct score names, and "+10" is wider than "+9".
 */
export function overflowButtonWidth(
  hidden: number,
  measurer: TimelineBarProps["measurer"],
): number {
  return (
    measurer.measure(`+${hidden}`) +
    SCORE_OVERFLOW_CHROME_PX +
    SCORE_OVERFLOW_BOLD_PX +
    SCORE_GROUP_GAP_PX
  );
}

/**
 * What `GroupedScoreBadges` will actually take, measured rather than guessed.
 *
 * A flat 48px reservation was the bug: two real scores render 100-300px, so a
 * leftover budget anywhere in between admitted the badges and then let the
 * cluster's overflow box cut them mid-glyph — exactly the clipping this layout
 * exists to remove, in exactly the narrow lanes it targets. The widest groups are
 * priced, because over-reserving drops a badge (recoverable, and the title says
 * so) while under-reserving clips one (not recoverable).
 *
 * Every term here is one the DOM actually charges, and the gap between this sum
 * and the rendered width is pinned in Storybook — three rounds of missing terms
 * (a flat 48px, a flat level pill, one gap instead of one per child) all passed
 * stories that could only see the admit-or-drop decision at one lane width.
 */
export function scoreBadgesWidth(
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

  const comma = measurer.measure(",");

  const widths = groups
    .map(([name, group]) => {
      // Each value is its own flex span: the text, one icon per comment and per
      // metadata (a value carrying both grows two), and a comma on all but the
      // last. Two spans are separated by the box's `gap-1` AND the span's `ml-1`.
      const values = group.reduce((total, score, index) => {
        const text = score.stringValue ?? score.value?.toFixed(2) ?? "";
        const icons = (score.comment ? 1 : 0) + (score.metadata ? 1 : 0);
        const separator =
          index === group.length - 1
            ? 0
            : SCORE_GAP_PX + comma + SCORE_VALUE_SEPARATOR_PX;
        return (
          total +
          measurer.measure(text) +
          icons * SCORE_VALUE_ICON_PX +
          separator
        );
      }, 0);
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
      // The chip is one `gap-1` flex row whose direct children are every level
      // pill, the name, and the values box — so N pills mean N + 1 gaps. Pricing
      // the name-to-values gap alone under-reserved a mixed-level chip by 4px
      // per extra pill, and the cluster's overflow box cuts what it admits.
      const gaps = (levels.length + 1) * SCORE_GAP_PX;
      return (
        Math.min(measurer.measure(`${name}:`), SCORE_NAME_MAX_PX) +
        values +
        pills +
        gaps +
        SCORE_CHIP_CHROME_PX
      );
    })
    .sort((a, b) => b - a)
    .slice(0, maxVisible);

  // Groups past the cap collapse into a "+N" button, which is also width.
  const hidden = groups.length - maxVisible;
  const overflow = hidden > 0 ? overflowButtonWidth(hidden, measurer) : 0;
  return widths.reduce(
    (total, width, index) =>
      total + width + (index > 0 ? SCORE_GROUP_GAP_PX : 0),
    overflow,
  );
}

/** How many score groups the cluster shows before the rest are hidden. */
export const MAX_SCORE_GROUPS = 3;

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
