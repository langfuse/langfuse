/**
 * Layout planner for the trace and observation detail headers. Pure +
 * framework-free so the adaptive behaviour can be unit-tested without a DOM.
 *
 * These headers sit in a resizable pane, so the width that decides the layout
 * is the header's own, not the screen's. Given that width and the action
 * cluster's natural width, the cluster goes:
 *
 *   beside    — on the title row, the title taking the rest,
 *   below     — on a full-width row of its own, once the title would be left
 *               under `minTitleWidth` beside it,
 *   icon-only — icon buttons with tooltips (no labels), when the full cluster
 *               no longer fits on a row of its own but icon-only buttons do,
 *   folded    — into the title row's overflow menu, once even icon-only buttons
 *               no longer fit on a row of their own.
 *
 * `folded` is what keeps the cluster on one line: it collapses before it would
 * have to wrap, so no button is ever orphaned onto a row by itself.
 */

export type DetailViewHeaderActionsPlacement =
  | "beside"
  | "below"
  | "icon-only"
  | "folded";

export type PlanDetailViewHeaderActionsArgs = {
  /** The header row's measured width, px (the detail pane minus its padding). */
  headerWidth: number;
  /** The action cluster's natural, unwrapped width, px. */
  actionsWidth: number;
  /**
   * The icon-only cluster's natural width, px. When provided, the planner will
   * prefer `"icon-only"` over `"folded"` when the full cluster overflows but
   * the icon-only version still fits.
   */
  iconOnlyActionsWidth?: number;
  /** Width the title keeps before the cluster moves off its row, px. */
  minTitleWidth: number;
  /** Gap between the title and the cluster while they share a row, px. */
  gap: number;
};

export function planDetailViewHeaderActions({
  headerWidth,
  actionsWidth,
  iconOnlyActionsWidth,
  minTitleWidth,
  gap,
}: PlanDetailViewHeaderActionsArgs): DetailViewHeaderActionsPlacement {
  if (headerWidth - actionsWidth - gap >= minTitleWidth) return "beside";
  if (actionsWidth <= headerWidth) return "below";
  if (iconOnlyActionsWidth !== undefined && iconOnlyActionsWidth <= headerWidth)
    return "icon-only";
  return "folded";
}
