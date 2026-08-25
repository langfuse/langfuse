/**
 * The metrics beside a bar: how long it took, what it cost, whether anyone
 * commented on it, and how it scored.
 *
 * Placement comes from `layout()`, which already measured which side of the bar
 * the duration fits on. Everything after the duration is this component's own
 * content, so it prices each item with the same measurer and admits them in
 * priority order — a duration always beats a cost you cannot finish reading.
 * Whatever does not fit is listed in the row's title instead, because a row that
 * silently omits a score reads as a row without one.
 *
 * The box clips. That is deliberate: a reservation that comes out under what the
 * DOM renders would push content over the lane edge, and a lane that overflows
 * is the one thing this timeline promises never to do.
 */

import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { cn } from "@/src/utils/tailwind";
import {
  CLUSTER_ITEM_GAP_PX,
  MAX_SCORE_GROUPS,
  commentIconWidth,
  createClusterFitter,
  scoreBadgesWidth,
  type ClusterScore,
} from "../../fns/timeline/metricCluster";
import { type Density } from "../../fns/timeline/density";
import { type TextMeasurer } from "../../fns/timeline/textMeasurer";
import { type PositionedNode } from "../../fns/timeline/layout";

/**
 * What a row has to say about itself, formatted by whoever owns the trace data.
 * The renderer stays presentational: it decides what FITS, never what a cost
 * looks like or whether a duration is alarming.
 */
export type RowMetrics = {
  /** Already formatted, e.g. `∑ $0.02`. */
  costText?: string | null;
  /** Heat-map classes, empty when the user has that colouring off. */
  durationClass?: string;
  costClass?: string;
  scores?: ClusterScore[];
  commentCount?: number;
};

export function TimelineRowMetrics({
  row,
  laneWidth,
  measurer,
  density,
  metrics,
  showDuration: durationEnabled,
  toneClass,
}: {
  row: PositionedNode;
  laneWidth: number;
  measurer: TextMeasurer;
  density: Density;
  metrics: RowMetrics;
  showDuration: boolean;
  /** Text colour for a label drawn ON the bar, from that bar's own luminance. */
  toneClass: string;
}) {
  const gapPx = density.labelGapPx;
  const insetPx = density.labelPaddingPx;

  // `hidden` is layout()'s verdict on the DURATION, not on the icons, which are
  // narrower and may well fit. Send the cluster to whichever side is roomier
  // rather than always falling in with `after` — in a narrow lane that is often
  // the side with nothing left.
  const spaceBefore = Math.max(row.x - gapPx, 0);
  const spaceAfter = Math.max(laneWidth - (row.x + row.width + gapPx), 0);
  const placement =
    row.labelPlacement === "hidden" && spaceBefore > spaceAfter
      ? "before"
      : row.labelPlacement;

  const style =
    placement === "before"
      ? {
          right: `${Math.max(laneWidth - row.x + gapPx, 0)}px`,
          maxWidth: `${spaceBefore}px`,
        }
      : placement === "inside"
        ? {
            left: `${row.x + insetPx}px`,
            maxWidth: `${Math.max(row.width - insetPx * 2, 0)}px`,
          }
        : {
            left: `${row.x + row.width + gapPx}px`,
            maxWidth: `${spaceAfter}px`,
          };

  const fits = createClusterFitter(
    Number.parseFloat(style.maxWidth),
    CLUSTER_ITEM_GAP_PX,
  );
  const fitsText = (text: string) => fits(measurer.measure(text));

  const durationText =
    durationEnabled && row.label && row.labelPlacement !== "hidden"
      ? row.label
      : null;
  const showDuration = durationText != null && fitsText(durationText);
  const showCost = Boolean(metrics.costText) && fitsText(metrics.costText!);
  const commentCount = metrics.commentCount ?? 0;
  const showComment =
    commentCount > 0 && fits(commentIconWidth(commentCount, measurer));
  const scores = metrics.scores ?? [];
  const showScores =
    scores.length > 0 &&
    fits(scoreBadgesWidth(scores, measurer, MAX_SCORE_GROUPS));

  if (!showDuration && !showCost && !showComment && !showScores) return null;

  // Everything the row HAS stays reachable on hover when something was dropped:
  // the items are admitted last against the smallest budget, so they are the
  // likeliest to go, and a row that never mentions its own score is worse than
  // one that mentions it in a title.
  const dropped = [
    durationText != null && !showDuration ? durationText : null,
    metrics.costText && !showCost ? metrics.costText : null,
    commentCount > 0 && !showComment
      ? `${commentCount} comment${commentCount === 1 ? "" : "s"}`
      : null,
    scores.length > 0 && !showScores
      ? `${scores.length} score${scores.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <div
      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2 overflow-hidden whitespace-nowrap"
      style={{ ...style, fontSize: `${density.labelFontPx}px` }}
      title={dropped.length > 0 ? dropped.join("  ") : undefined}
      data-testid="timeline-dense-metrics"
      data-placement={placement}
    >
      {showComment ? <CommentCountIcon count={commentCount} /> : null}
      {showDuration ? (
        <span
          className={cn(
            placement === "inside" ? toneClass : "text-muted-foreground",
            metrics.durationClass,
          )}
          data-testid="timeline-dense-duration"
          data-placement={placement}
        >
          {durationText}
        </span>
      ) : null}
      {showCost ? (
        <span
          className={cn(
            placement === "inside" ? toneClass : "text-muted-foreground",
            metrics.costClass,
          )}
        >
          {metrics.costText}
        </span>
      ) : null}
      {showScores ? (
        <div className="flex max-h-5 gap-1" data-testid="timeline-dense-scores">
          {/* Not expandable: this box was measured for exactly `MAX_SCORE_GROUPS`
              chips, so expanding in place would clip the ones already drawn. */}
          <GroupedScoreBadges
            scores={scores}
            maxVisible={MAX_SCORE_GROUPS}
            expandable={false}
          />
        </div>
      ) : null}
    </div>
  );
}
