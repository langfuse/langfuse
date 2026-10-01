/** The 8-slot chart palette, cycled by series index (matches the series fills). */
export const seriesColor = (index: number): string =>
  `hsl(var(--chart-${(index % 8) + 1}))`;

/**
 * Honest "we didn't draw everything" caption for charts whose breakdown
 * overflowed the render cap (see {@link prepareVisibleSeries}). Rendered even
 * when the legend is hidden so a capped chart never silently looks complete.
 * (LFE-10549)
 */
export function SeriesOverflowNote({
  visibleCount,
  totalCount,
}: {
  visibleCount: number;
  totalCount: number;
}) {
  return (
    <div className="text-muted-foreground shrink-0 pb-1 text-right text-xs">
      Showing top {visibleCount} of {totalCount} series
    </div>
  );
}
