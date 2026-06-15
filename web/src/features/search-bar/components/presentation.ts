// Pure presentational constants + helpers shared by the live composer and
// the autocomplete popover. A separate module (not a component file) so the
// component files keep Fast Refresh eligibility.

// Page-neutral: the bar mounts on both the Observations and Traces tables.
export const COMPOSER_PLACEHOLDER =
  "Search — e.g. level:ERROR, -env:dev, latency:>2, scores.accuracy:>0.8";

/** DOM id for an option row — referenced by aria-activedescendant. Option ids
 *  embed observed values (`value:My Test Trace`) and recent queries, which can
 *  contain whitespace; an id with whitespace is invalid HTML and breaks the
 *  aria-activedescendant IDREF, so collapse it. */
export function optionDomId(listboxId: string, optionId: string): string {
  return `${listboxId}-opt-${optionId.replace(/\s+/g, "_")}`;
}
