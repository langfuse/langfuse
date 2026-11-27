// Pure presentational constants + helpers shared by the live composer and
// the autocomplete popover. A separate module (not a component file) so the
// component files keep Fast Refresh eligibility.

import type { ComposerSegment } from "@/src/features/search-bar/lib/composer-segments";
import type { FieldRegistry } from "@/src/features/search-bar/lib/fields";
import type { CompareOp } from "@/src/features/search-bar/lib/ast";

/** Per-view: the examples have to name fields the view actually has. */
export function composerPlaceholder(registry: FieldRegistry): string {
  if (registry.searchPlaceholder) return registry.searchPlaceholder;
  return registry.searchExamples.length > 0
    ? `Search — e.g. ${registry.searchExamples.join(", ")}`
    : "Search";
}

/**
 * Why this token is NOT applied on the current surface (e.g. a column the chart
 * view can't filter on), or null when it is. Shared by the token styling (dim +
 * strike) and the hover tooltip so both read the same source.
 */
export function deactivationReason(
  segment: ComposerSegment,
  fieldReason?: (field: string, op?: CompareOp) => string | null,
  freeTextReason?: string | null,
): string | null {
  if (segment.kind === "filter")
    return fieldReason?.(segment.displayField, segment.op) ?? null;
  if (segment.kind === "freeText") return freeTextReason ?? null;
  return null;
}
