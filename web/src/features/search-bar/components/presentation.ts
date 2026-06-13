// Pure presentational constants + helpers shared by the live composer and
// the autocomplete popover. A separate module (not a component file) so the
// component files keep Fast Refresh eligibility.

// Page-neutral: the bar mounts on both the Observations and Traces tables.
export const COMPOSER_PLACEHOLDER =
  "Search — e.g. level:ERROR, -env:dev, latency:>2, scores.accuracy:>0.8";

/** DOM id for an option row — referenced by aria-activedescendant. */
export function optionDomId(listboxId: string, optionId: string): string {
  return `${listboxId}-opt-${optionId}`;
}
