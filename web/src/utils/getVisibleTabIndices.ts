/**
 * Picks the tab indices an underline tab row shows when its triggers do not all
 * fit. Tabs fill the row in order until the next one would spill, and the rest
 * go behind an overflow trigger that needs `overflowWidth` of the row itself.
 *
 * The active tab always stays visible: when it would overflow, it takes the
 * last slot and the tabs it displaces move behind the trigger instead. Tabs
 * keep their default order, so once one spills no later tab is shown.
 */
export function getVisibleTabIndices({
  widths,
  availableWidth,
  overflowWidth,
  activeIndex,
}: {
  widths: number[];
  availableWidth: number;
  overflowWidth: number;
  activeIndex: number;
}): number[] {
  // Sub-pixel layout rounds against the content at the exact boundary, so
  // spend a pixel of slack rather than collapsing a row that just fits.
  const limit = availableWidth + 1;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= limit) return widths.map((_, index) => index);

  const budget = limit - overflowWidth;
  const active =
    activeIndex >= 0 && activeIndex < widths.length ? activeIndex : null;
  const visible: number[] = [];
  let used = active === null ? 0 : widths[active];

  /** False once a tab spills. */
  const take = (from: number, to: number) => {
    for (let index = from; index < to; index++) {
      if (used + widths[index] > budget) return false;
      used += widths[index];
      visible.push(index);
    }
    return true;
  };

  if (active === null) {
    take(0, widths.length);
    return visible;
  }

  const prefixFits = take(0, active);
  visible.push(active);
  if (prefixFits) take(active + 1, widths.length);
  return visible;
}
