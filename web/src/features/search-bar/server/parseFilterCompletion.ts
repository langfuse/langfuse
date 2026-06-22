// Pure post-processing for the v4 AI filter endpoint: turn a raw LLM completion
// string into the `FilterState` the bar can apply. Kept separate from the tRPC
// procedure (which owns auth, gating, telemetry, and the LLM call) so this — the
// part with real branching logic — is unit-testable without a live model. This
// mirrors the search-bar feature's own lib/ (pure) vs I/O split.

import { type FilterState, singleFilter } from "@langfuse/shared";
import { z } from "zod";

import { filterStateToQueryText } from "../lib/filter-state-to-query";

const FilterArraySchema = z.array(singleFilter);

/**
 * Extract a `FilterState` from the model's completion. Tries the whole string,
 * then the widest bracketed array (greedy, so it survives nested objects), and
 * tolerates a `{ "filters": [...] }` wrapper. Returns [] when nothing parses.
 */
function parseFilterArray(completion: string): FilterState {
  const arrayMatch = completion.match(/\[[\s\S]*\]/)?.[0];
  const candidates = [completion, arrayMatch].filter((c): c is string =>
    Boolean(c),
  );
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const filtersArray = Array.isArray(parsed) ? parsed : parsed.filters;
      return FilterArraySchema.parse(filtersArray);
    } catch {
      // try the next candidate
    }
  }
  return [];
}

export type GeneratedFilters = {
  /** Filters that round-trip to bar grammar — safe to apply and show as pills. */
  filters: FilterState;
  /** The derived bar query text (for display / telemetry). */
  queryText: string;
  /** How many model filters were dropped as non-representable (hallucinated or
   *  non-v4 columns). */
  droppedCount: number;
};

/**
 * Parse the model completion and keep only the filters that round-trip to bar
 * grammar. A hallucinated or non-v4 column lands in `skippedFilters` and is
 * dropped here, so a caller can never apply a filter the bar can't show as an
 * editable pill.
 */
export function parseGeneratedFilters(completion: string): GeneratedFilters {
  const parsed = parseFilterArray(completion);
  const { text, skippedFilters } = filterStateToQueryText(parsed);
  const skipped = new Set(skippedFilters);
  const filters = parsed.filter((f) => !skipped.has(f));
  return { filters, queryText: text, droppedCount: skippedFilters.length };
}
