// Pure presentational constants + helpers shared by the live composer and
// the autocomplete popover. A separate module (not a component file) so the
// component files keep Fast Refresh eligibility.

import type { ComposerSegment } from "@/src/features/search-bar/lib/composer-segments";

// Page-neutral: the bar mounts on both the Observations and Traces tables.
export const COMPOSER_PLACEHOLDER =
  "Search — e.g. level:ERROR, -env:dev, latency:>2, scores.accuracy:>0.8";

/** DOM id for an option row — referenced by aria-activedescendant. Option ids
 *  embed observed values (`value:My Test Trace`) and recent queries, which can
 *  contain whitespace; an id with whitespace is invalid HTML and breaks the
 *  aria-activedescendant IDREF. encodeURIComponent escapes whitespace (→ `%20`)
 *  while leaving underscore literal, so it is injective — distinct option ids
 *  always map to distinct DOM ids (a `\s+ → _` collapse would alias
 *  `My Test`/`My_Test` to the same duplicate id). */
export function optionDomId(listboxId: string, optionId: string): string {
  return `${listboxId}-opt-${encodeURIComponent(optionId)}`;
}

/**
 * Why this token is NOT applied on the current surface (e.g. a column the chart
 * view can't filter on), or null when it is. Shared by the token styling (dim +
 * strike) and the hover tooltip so both read the same source.
 */
export function deactivationReason(
  segment: ComposerSegment,
  fieldReason?: (field: string) => string | null,
  freeTextReason?: string | null,
): string | null {
  if (segment.kind === "filter")
    return fieldReason?.(segment.displayField) ?? null;
  if (segment.kind === "freeText") return freeTextReason ?? null;
  return null;
}
