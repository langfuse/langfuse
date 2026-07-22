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
    if (!filter.isActive) {
      // "All" only makes sense once there are several options to keep; while
      // options are loading, absent, or a lone value the header stays quiet.
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
      return filter.options.length > 1 ? "All" : null;
    }

    // A column can carry BOTH a checkbox filter and text filters (authorable
    // via URL or the search bar even though the sidebar applies them
    // mutually exclusively) — report every part, not just one.
    const parts: string[] = [];

    if (filter.operator === "none of") {
      // Checkboxes show the KEPT complement (LFE-10717); the applied filter
      // is the unchecked rest. Prefer the hook's raw exclusion list — it
      // includes carried exclusions outside the current option list that the
      // visible-options complement misses (a deep-linked `none of [a, b, c]`
      // with only `b` still observed must not read as just "not b"). The
      // complement fallback covers manually constructed filters.
      const kept = new Set(filter.value);
      const excluded =
        filter.excludedValues ??
        filter.options.filter((option) => !kept.has(option));
      if (excluded.length === 1) {
        parts.push(`not ${displayValue(excluded[0], filter.displayByValue)}`);
      } else if (excluded.length > 1) {
        parts.push(`not ${excluded.length} values`);
      }
    } else if (
      filter.value.length === 1 &&
      // a real checkbox filter (operator set) or a strict subset — NOT the
      // all-checked default of a single-option facet under a text filter
      (filter.operator !== undefined ||
        filter.value.length < filter.options.length)
    ) {
      parts.push(displayValue(filter.value[0], filter.displayByValue));
    } else if (
      filter.value.length > 1 &&
      filter.value.length === filter.options.length &&
      filter.operator === "any of"
    ) {
      // An explicit keep-everything filter (the managed-env column persists
      // an all-selected override): an ACTIVE "All" chip reads truer than
      // "N selected".
      parts.push("All");
    } else if (
      filter.value.length > 1 &&
      (filter.value.length < filter.options.length ||
        filter.operator === "all of")
    ) {
      parts.push(`${filter.value.length} selected`);
    }

    if (filter.textFilters && filter.textFilters.length > 0) {
      if (filter.textFilters.length === 1) {
        const entry = filter.textFilters[0];
        parts.push(
          entry.operator === "contains"
            ? `contains "${entry.value}"`
            : `not "${entry.value}"`,
        );
      } else {
        parts.push(`${filter.textFilters.length} text filters`);
      }
    }

    return parts.length > 0 ? parts.join(" · ") : "filtered";
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
 * The single option value a categorical facet's summary refers to, or null
 * when the summary is not about exactly one value (counts, text filters,
 * inactive "All", …). Lets the header chip reuse the facet's per-value
 * color coding (renderIcon) — e.g. the Status chip carries the level color.
 * Mirrors getFacetSummary's single-value branches.
 */
export function getFacetSummaryValue(filter: UIFilter): string | null {
  if (filter.type !== "categorical") return null;
  if (filter.textFilters && filter.textFilters.length > 0) return null;

  if (!filter.isActive) {
    // inactive strict-subset kept set (managed environments) with one value
    if (
      filter.options.length > 0 &&
      filter.value.length === 1 &&
      filter.value.length < filter.options.length
    ) {
      return filter.value[0];
    }
    return null;
  }

  if (filter.operator === "none of") {
    const kept = new Set(filter.value);
    const excluded =
      filter.excludedValues ??
      filter.options.filter((option) => !kept.has(option));
    return excluded.length === 1 ? excluded[0] : null;
  }

  if (
    filter.value.length === 1 &&
    (filter.operator !== undefined ||
      filter.value.length < filter.options.length)
  ) {
    return filter.value[0];
  }
  return null;
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
