/**
 * Picks the tab indices an underline tab row shows when its triggers do not all
 * fit. Tabs fill the row in order until the next one would spill, and the rest
 * go behind an overflow trigger that needs `overflowWidth` of the row itself.
 *
 * The active tab always stays visible: when it would overflow, it takes the
 * last slot and the tabs it displaces move behind the trigger instead.
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

  const take = (from: number, to: number) => {
    for (let index = from; index < to; index++) {
      if (used + widths[index] > budget) return;
      used += widths[index];
      visible.push(index);
    }
  };

  if (active === null) {
    take(0, widths.length);
    return visible;
  }

  take(0, active);
  visible.push(active);
  take(active + 1, widths.length);
  return visible;
}
