/**
 * Layout planner for the trace and observation detail headers. Pure +
 * framework-free so the adaptive behaviour can be unit-tested without a DOM.
 *
 * These headers sit in a resizable pane, so the width that decides the layout
 * is the header's own, not the screen's. Given that width and the action
 * cluster's natural width, the cluster goes:
 *
 *   beside — on the title row, the title taking the rest,
 *   below  — on a full-width row of its own, once the title would be left
 *            under `minTitleWidth` beside it,
 *   folded — into the title row's overflow menu, once the cluster no longer
 *            fits even on a row of its own.
 *
 * `folded` is what keeps the cluster on one line: it collapses before it would
 * have to wrap, so no button is ever orphaned onto a row by itself.
 */

export type DetailViewHeaderActionsPlacement = "beside" | "below" | "folded";

export type PlanDetailViewHeaderActionsArgs = {
  /** The header row's measured width, px (the detail pane minus its padding). */
  headerWidth: number;
  /** The action cluster's natural, unwrapped width, px. */
  actionsWidth: number;
  /** Width the title keeps before the cluster moves off its row, px. */
  minTitleWidth: number;
  /** Gap between the title and the cluster while they share a row, px. */
  gap: number;
};

export function planDetailViewHeaderActions({
  headerWidth,
  actionsWidth,
  minTitleWidth,
  gap,
}: PlanDetailViewHeaderActionsArgs): DetailViewHeaderActionsPlacement {
  if (headerWidth - actionsWidth - gap >= minTitleWidth) return "beside";
  if (actionsWidth <= headerWidth) return "below";
  return "folded";
}
