/* eslint-disable @repo/no-null-render */
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

import { type Density } from "../../fns/timeline/density";
import { type TextMeasurer } from "../../fns/timeline/textMeasurer";
import { type PositionedNode } from "../../fns/timeline/layout";

/**
 * What a row has to say about itself, formatted by whoever owns the trace data.
 * The renderer stays presentational: it decides what FITS, never what a cost
 * looks like.
 *
 * Deliberately just the cost. Scores, comment counts and heat-map colouring were
 * all tried here and all removed for the same reason: a row beside a bar cannot
 * hold them CONSISTENTLY. Whether they fit depends on where the bar happens to
 * sit and how far you have zoomed, so identical rows showed different things —
 * and the heat map put a second meaning on colour that already means observation
 * type, painting dark red text on a blue bar whose label had already been given
 * white for contrast. They belong somewhere that does not move: the tree, the
 * detail panel, or a fixed column of their own.
 */
/**
 * The cluster's own `gap-2`. A budget has to reserve the gap the cluster actually
 * renders with, not a smaller one: five admitted items multiply a 2px
 * under-reservation into a clipped last item.
 */
const CLUSTER_ITEM_GAP_PX = 8;

/**
 * Admit items into the room the lane has left, in priority order, charging each
 * the gap the cluster renders with. The flex gap sits BETWEEN children, so the
 * first item is charged none: billing it for a gap it does not have rejected
 * content that renders perfectly well alone.
 */
function createClusterFitter(budgetPx: number, gapPx: number) {
  let spentPx = 0;
  return (widthPx: number): boolean => {
    const next = spentPx + widthPx + (spentPx > 0 ? gapPx : 0);
    if (next > budgetPx) return false;
    spentPx = next;
    return true;
  };
}

export type RowMetrics = {
  /** Already formatted, e.g. `∑ $0.02`. */
  costText?: string | null;
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

  // `layout()` chooses a side by measuring the DURATION alone. The cluster is
  // wider than that, so it chooses its own — by room, not by inheritance.
  //
  // Inheriting was the bug behind "they disappear when I zoom in": zooming grows
  // the bar until the duration fits inside it, at which point the budget stops
  // being "the rest of the lane" and becomes "this bar", so a cluster that fit a
  // moment ago no longer does. More space for the bar meant less for the label.
  // Inside is now the LAST resort, taken only when neither flank has room.
  const spaceBefore = Math.max(row.x - gapPx, 0);
  const spaceAfter = Math.max(laneWidth - (row.x + row.width + gapPx), 0);
  const spaceInside = Math.max(row.width - insetPx * 2, 0);
  const placement =
    spaceAfter >= spaceBefore && spaceAfter >= spaceInside
      ? "after"
      : spaceBefore >= spaceInside
        ? "before"
        : "inside";

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
  // Nothing fitted: draw nothing. The row is not silent — hovering it names it
  // and states the same duration and cost, for every row at every density,
  // which is a better fallback than a title on a box of zero width.
  if (!showDuration && !showCost) return null;

  // What did not fit stays reachable on hover: a row that silently omits its
  // cost reads as a row without one.
  const dropped = [
    durationText != null && !showDuration ? durationText : null,
    metrics.costText && !showCost ? metrics.costText : null,
  ].filter(Boolean);

  return (
    <div
      className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2 overflow-hidden whitespace-nowrap"
      style={{ ...style, fontSize: `${density.labelFontPx}px` }}
      title={dropped.length > 0 ? dropped.join("  ") : undefined}
      data-testid="timeline-dense-metrics"
      data-placement={placement}
    >
      {showDuration ? (
        <span
          className={
            placement === "inside" ? toneClass : "text-muted-foreground"
          }
          data-testid="timeline-dense-duration"
          data-placement={placement}
        >
          {durationText}
        </span>
      ) : null}
      {showCost ? (
        <span
          className={
            placement === "inside" ? toneClass : "text-muted-foreground"
          }
        >
          {metrics.costText}
        </span>
      ) : null}
    </div>
  );
}
