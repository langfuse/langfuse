/**
 * Priority-plus overflow math for the peek header's right-aligned control
 * cluster. Pure + framework-free so the collapse behaviour can be unit-tested
 * without a DOM. The header measures its controls and calls this to decide
 * which low-priority units collapse into the "…" popover when space is tight.
 *
 * Keeping it width-based (not breakpoint-based) lets the peek — which the user
 * resizes freely from ~40% to full width — show everything when there's room
 * and fold the least-important controls away when there isn't.
 */

export type PlanToolbarOverflowArgs<K extends string> = {
  /** Width available to the whole right cluster (header width − reserved title), px. */
  clusterWidth: number;
  /** Measured widths (px) of each present overflowable unit; absent ⇒ not rendered. */
  unitWidths: Partial<Record<K, number>>;
  /** Units in collapse order: the first entry is the first to move into "…". */
  dropOrder: readonly K[];
  /** Combined width (px) of the pinned controls that never collapse. */
  pinnedWidth: number;
  /** Width (px) of the "…" trigger, counted only once something overflows. */
  moreWidth: number;
  /** Slack (px) absorbing inter-control gaps + sub-pixel rounding so we fold a touch early. */
  safety?: number;
};

/**
 * Returns the set of units that should collapse into the overflow menu. Empty
 * when everything fits inline (and the "…" trigger isn't needed).
 */
export function planToolbarOverflow<K extends string>({
  clusterWidth,
  unitWidths,
  dropOrder,
  pinnedWidth,
  moreWidth,
  safety = 24,
}: PlanToolbarOverflowArgs<K>): Set<K> {
  const present = dropOrder.filter((u) => unitWidths[u] != null);
  const widthOf = (u: K) => unitWidths[u] ?? 0;
  const sum = (units: K[]) => units.reduce((acc, u) => acc + widthOf(u), 0);

  // Everything fits inline → no overflow, no "…" trigger.
  if (pinnedWidth + sum(present) + safety <= clusterWidth) {
    return new Set<K>();
  }

  // Otherwise the "…" trigger is shown; drop the lowest-priority units (front
  // of dropOrder) until the remaining inline controls + the trigger fit.
  const overflow = new Set<K>();
  let visible = [...present];
  for (const unit of dropOrder) {
    if (pinnedWidth + moreWidth + sum(visible) + safety <= clusterWidth) break;
    if (!visible.includes(unit)) continue;
    overflow.add(unit);
    visible = visible.filter((u) => u !== unit);
  }
  return overflow;
}
