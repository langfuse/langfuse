import { type Density } from "../../../fns/timeline/density";
import { type TextMeasurer } from "../../../fns/timeline/textMeasurer";
import { type PositionedNode } from "../../../fns/timeline/layout";
import { type RowMetrics } from "../TimelineRowMetrics";

export function getTimelineRowMetrics({
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
  toneClass: string;
}) {
  const gapPx = density.labelGapPx;
  const insetPx = density.labelPaddingPx;
  // Choose room for the whole cluster, not the duration-only placement from
  // layout(): growing a bar must not shrink the available label budget.
  const spaceBefore = Math.max(row.x - gapPx, 0);
  const spaceAfter = Math.max(laneWidth - (row.x + row.width + gapPx), 0);
  const spaceInside = Math.max(row.width - insetPx * 2, 0);
  const placement = (() => {
    if (spaceAfter >= spaceBefore && spaceAfter >= spaceInside) return "after";
    if (spaceBefore >= spaceInside) return "before";
    return "inside";
  })();
  const style = (() => {
    if (placement === "before") {
      return {
        right: `${Math.max(laneWidth - row.x + gapPx, 0)}px`,
        maxWidth: `${spaceBefore}px`,
      };
    }
    if (placement === "inside") {
      return {
        left: `${row.x + insetPx}px`,
        maxWidth: `${spaceInside}px`,
      };
    }
    return {
      left: `${row.x + row.width + gapPx}px`,
      maxWidth: `${spaceAfter}px`,
    };
  })();
  let spentPx = 0;
  const fitsText = (text: string) => {
    // Reserve the rendered gap-2 only between admitted items.
    const next = spentPx + measurer.measure(text) + (spentPx > 0 ? 8 : 0);
    if (next > Number.parseFloat(style.maxWidth)) return false;
    spentPx = next;
    return true;
  };
  const durationText =
    durationEnabled && row.label && row.labelPlacement !== "hidden"
      ? row.label
      : null;
  const showDuration = durationText != null && fitsText(durationText);
  const showCost = Boolean(metrics.costText) && fitsText(metrics.costText!);
  // The row's hover still supplies duration and cost when neither fits.
  if (!showDuration && !showCost) return null;
  const dropped = [
    durationText != null && !showDuration ? durationText : null,
    metrics.costText && !showCost ? metrics.costText : null,
  ].filter(Boolean);
  return {
    offsetPx: Number.parseFloat(style.right ?? style.left),
    maxWidthPx: Number.parseFloat(style.maxWidth),
    fontSizePx: density.labelFontPx,
    placement,
    title: dropped.length > 0 ? dropped.join("  ") : undefined,
    durationText: showDuration ? durationText : null,
    costText: showCost ? metrics.costText : null,
    toneClass,
  };
}
