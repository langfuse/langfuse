/**
 * The active search in the trace panel, resolved once for every view that
 * highlights it in place — the Timeline's bars and the Graph's nodes.
 *
 * There is one of these rather than a copy per view because both views state a
 * COUNT. Two independent filters over the same observations would eventually
 * disagree about a number the user can read off two surfaces at once, and the
 * cheapest way for that never to happen is for there to be one filter.
 *
 * `undefined` means no query: the views show their resting state, nothing dims.
 * A query with no hits is NOT undefined — it is an empty `matchedIds` with a
 * "No matches" label, and dims everything.
 */
import { useMemo } from "react";

import { useSearch } from "@/src/features/traces/contexts/SearchContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { matchesSearchQuery } from "@/src/features/traces/fns/matchesSearchQuery";

export type TraceSearchMatches = {
  /**
   * The raw query. Views key "reveal the first hit once per query" on it, so
   * retyping what is already in the box does not move the view.
   */
  query: string;
  /** Observation ids that answer the query. */
  matchedIds: ReadonlySet<string>;
  /** The quiet readout — "3 matches" / "1 match" / "No matches". */
  label: string;
};

export function useTraceSearchMatches(): TraceSearchMatches | undefined {
  const { searchQuery } = useSearch();
  const { searchItems } = useTraceData();

  return useMemo(() => {
    if (!searchQuery.trim()) return undefined;
    const matchedIds = new Set(
      searchItems
        .filter((item) => matchesSearchQuery(item.node, searchQuery))
        .map((item) => item.node.id),
    );
    return {
      query: searchQuery,
      matchedIds,
      // Counted over the whole trace, not over the rows or nodes a view happens
      // to be showing: the number has to be the number the flat result list
      // would give for the same query.
      label:
        matchedIds.size === 0
          ? "No matches"
          : `${matchedIds.size} ${matchedIds.size === 1 ? "match" : "matches"}`,
    };
  }, [searchItems, searchQuery]);
}
