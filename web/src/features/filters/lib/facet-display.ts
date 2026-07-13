import type { UIFilter } from "@/src/features/filters/hooks/useSidebarFilterState";
import { filterRank } from "@/src/features/search-bar/lib/rank";

// Pure display helpers for the faceted filter sidebar
// (data-table-controls.tsx). No React, no state — unit-testable.

const displayValue = (
  value: string,
  displayByValue?: Map<string, string>,
): string => displayByValue?.get(value) ?? (value === "" ? "(empty)" : value);

/**
 * One-line header summary answering "what is selected?" for a facet.
 *
 * The root ambiguity this resolves: for checkbox facets, all-checked means
 * "no filter" (computeSelectedValues reports every option as selected), so
 * the checkbox list alone cannot tell "everything kept on purpose" apart
 * from "not filtered". The header therefore states it explicitly:
 * - inactive checkbox facets read "All"
 * - active facets read a compact description of the applied filter
 *   (the single selected value, "N selected", "N excluded", a numeric
 *   range, the searched text, or the condition count for keyed facets).
 *
 * Returns null when there is nothing useful to say (e.g. inactive facets of
 * types that have no all-checked ambiguity, or empty option lists).
 */
export function getFacetSummary(filter: UIFilter): string | null {
  if (filter.type === "categorical") {
    if (filter.textFilters && filter.textFilters.length > 0) {
      if (filter.textFilters.length === 1) {
        const entry = filter.textFilters[0];
        return entry.operator === "contains"
          ? `contains "${entry.value}"`
          : `excludes "${entry.value}"`;
      }
      return `${filter.textFilters.length} text filters`;
    }

    if (!filter.isActive) {
      // "All" only makes sense once there are options to keep; while options
      // are loading or absent the header stays quiet.
      if (filter.options.length === 0) return null;
      // An inactive facet can still keep a strict subset: the managed
      // environment policy applies an implicit `none of [hidden]` default
      // that never counts as user-authored (isActive stays false, no Clear).
      // Saying "All" there would contradict the visibly unchecked hidden
      // environments — describe the kept set instead.
      if (
        filter.value.length > 0 &&
        filter.value.length < filter.options.length
      ) {
        return filter.value.length === 1
          ? displayValue(filter.value[0], filter.displayByValue)
          : `${filter.value.length} selected`;
      }
      return "All";
    }

    if (filter.operator === "none of") {
      // Checkboxes show the KEPT complement (LFE-10717); the applied filter
      // is the unchecked rest. Exclusions that fell out of the current
      // option list are invisible here, so the count can come up 0 — the
      // filter is still live, say so generically.
      const kept = new Set(filter.value);
      const excludedCount = filter.options.filter(
        (option) => !kept.has(option),
      ).length;
      if (excludedCount === 0) return "filtered";
      if (excludedCount === 1) {
        const excluded = filter.options.find((option) => !kept.has(option))!;
        return `not ${displayValue(excluded, filter.displayByValue)}`;
      }
      return `${excludedCount} excluded`;
    }

    if (filter.value.length === 1) {
      return displayValue(filter.value[0], filter.displayByValue);
    }
    return `${filter.value.length} selected`;
  }

  if (filter.type === "numeric") {
    if (!filter.isActive) return null;
    const unit = filter.unit ? ` ${filter.unit}` : "";
    return `${filter.value[0]}–${filter.value[1]}${unit}`;
  }

  if (filter.type === "string") {
    if (!filter.isActive) return null;
    return `"${filter.value}"`;
  }

  // Keyed facets (metadata, categorical/numeric/boolean scores): one entry →
  // name the key; several → count them.
  if (!filter.isActive) return null;
  if (filter.value.length === 1) return filter.value[0].key;
  return `${filter.value.length} conditions`;
}

/**
 * Rank a facet's option values for its search box the way the search bar
 * ranks completions (prefix matches before substring matches, stable within
 * a rank) instead of plain substring filtering. Matches against the raw
 * value and its display label; the better rank wins.
 */
export function rankFacetOptions(
  options: string[],
  query: string,
  displayByValue?: Map<string, string>,
): string[] {
  return options
    .map((option) => {
      const valueRank = filterRank(option, query);
      const display = displayByValue?.get(option);
      const displayRank =
        display !== undefined ? filterRank(display, query) : null;
      const rank =
        valueRank === null
          ? displayRank
          : displayRank === null
            ? valueRank
            : Math.min(valueRank, displayRank);
      return { option, rank };
    })
    .filter((x): x is { option: string; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.option);
}
