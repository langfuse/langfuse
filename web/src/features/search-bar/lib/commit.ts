// The commit gate, as a pure function (no React, no store).
//
// "Committing" the search bar means: validate the draft text, and if it lowers
// cleanly, produce the flat filter state + full-text search the table consumes.
// This is the single boundary where editor text becomes applied filter state —
// the container calls it and writes the result to the URL filter state (the
// one source of truth). Keeping it pure makes the commit semantics unit-
// testable without rendering anything.

import type { FilterState, TracingSearchType } from "@langfuse/shared";

import { astToFilterState, type ScoreTypeContext } from "./adapter";
import { serialize, type Diagnostic } from "./qlang";
import { validateQuery } from "./validate";

/** Search scope applied when the query carries no explicit `in:` token. */
export const DEFAULT_SEARCH_TYPE: TracingSearchType[] = ["id"];

export type CommitResult =
  | {
      status: "committed";
      filters: FilterState;
      searchQuery: string | null;
      searchType: TracingSearchType[];
      /** Canonical serialization of the committed query (for recent searches). */
      canonical: string;
    }
  | { status: "invalid"; diagnostics: Diagnostic[] };

/**
 * Validate and lower `draftText`. `committed` carries everything the table
 * needs; `invalid` carries the span-tagged diagnostics for the editor to show.
 * `validateQuery` and `astToFilterState` agree by construction, so a valid
 * draft always lowers without errors. `scoreTypes` (observed score names by
 * type) lets `scores.<name>:<value>` lower to the right column.
 */
export function planCommit(
  draftText: string,
  scoreTypes?: ScoreTypeContext,
): CommitResult {
  const res = validateQuery(draftText.trim());
  if (!res.valid) {
    return { status: "invalid", diagnostics: res.diagnostics };
  }
  const { filters, searchQuery, searchType } = astToFilterState(
    res.ast,
    scoreTypes,
  );
  return {
    status: "committed",
    filters,
    searchQuery,
    searchType: searchType ?? DEFAULT_SEARCH_TYPE,
    canonical: serialize(res.ast),
  };
}
