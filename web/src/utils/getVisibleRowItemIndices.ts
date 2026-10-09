/**
 * Picks which items of a single row stay visible when they do not all fit.
 * Items fill the row in order until the next one would spill, and the rest go
 * behind an overflow trigger that needs `overflowWidth` of the row itself.
 *
 * The pinned item always stays visible: when it would overflow, it takes the
 * last slot and the items it displaces move behind the trigger instead. Items
 * keep their order, so once one spills no later item is shown.
 */
export function getVisibleRowItemIndices({
  widths,
  availableWidth,
  overflowWidth,
  pinnedIndex,
}: {
  widths: number[];
  availableWidth: number;
  overflowWidth: number;
  pinnedIndex: number;
}): number[] {
  // Sub-pixel layout rounds against the content at the exact boundary, so
  // spend a pixel of slack rather than collapsing a row that just fits.
  const limit = availableWidth + 1;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= limit) return widths.map((_, index) => index);

  const budget = limit - overflowWidth;
  const pinned =
    pinnedIndex >= 0 && pinnedIndex < widths.length ? pinnedIndex : null;
  const visible: number[] = [];
  let used = pinned === null ? 0 : widths[pinned];

  /** False once a tab spills. */
  const take = (from: number, to: number) => {
    for (let index = from; index < to; index++) {
      if (used + widths[index] > budget) return false;
      used += widths[index];
      visible.push(index);
    }
    return true;
  };

  if (pinned === null) {
    take(0, widths.length);
    return visible;
  }

  const prefixFits = take(0, pinned);
  visible.push(pinned);
  if (prefixFits) take(pinned + 1, widths.length);
  return visible;
}
