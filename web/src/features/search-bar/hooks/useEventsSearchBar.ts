// Container hook: wires the draft-only search-bar store to the table's filter
// state with a single, one-way data direction.
//
//   URL filter state (FilterState + searchQuery/searchType)   ← single source
//        │ filterStateToQueryText (pure, derived)
//        ▼
//   committedText ──resetTo──▶ store.draft ──(edit)──▶ draft
//        ▲                                                │ planCommit (pure)
//        └──────────── setFilterState/… ◀── commit() ◀────┘
//
// There is exactly one effect (seed the draft when the derived committed text
// changes) and it never writes back to the filter state, so the cycle cannot
// loop — no reconciliation signature, no second source of truth. The bar is a
// controlled editor over the same state the facet sidebar edits.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FilterState, TracingSearchType } from "@langfuse/shared";

import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { recordRecentSearch } from "@/src/features/search-bar/lib/recent-searches";
import {
  createSearchBarStore,
  type SearchBarStore,
} from "@/src/features/search-bar/store/searchBarStore";

export function useEventsSearchBar({
  projectId,
  enabled,
  filterState,
  searchQuery,
  searchType,
  setFilterState,
  setSearchQuery,
  setSearchType,
}: {
  projectId: string;
  enabled: boolean;
  /** The user's explicit facet filters (sidebar `explicitFilterState`). */
  filterState: FilterState;
  searchQuery: string | null;
  searchType: TracingSearchType[];
  setFilterState: (filters: FilterState) => void;
  setSearchQuery: (query: string | null) => void;
  setSearchType: (type: TracingSearchType[]) => void;
}): { store: SearchBarStore; commit: () => boolean } {
  const [store] = useState(() => createSearchBarStore());

  // Committed query text DERIVED from the single source of truth. Pure.
  const committedText = useMemo(
    () => filterStateToQueryText(filterState, { searchQuery, searchType }).text,
    [filterState, searchQuery, searchType],
  );

  // The one external→local sync: seed the draft whenever the committed
  // baseline changes (a commit echo, a sidebar edit, a saved view, or
  // navigation). resetTo is a no-op when the draft already matches, so a
  // commit's own echo settles immediately without clobbering the caret.
  useEffect(() => {
    if (!enabled) return;
    store.getState().actions.resetTo(committedText);
  }, [enabled, committedText, store]);

  // Latest applied-state setters, read inside commit without rebuilding it.
  const applyRef = useRef({ setFilterState, setSearchQuery, setSearchType });
  applyRef.current = { setFilterState, setSearchQuery, setSearchType };

  const commit = useCallback((): boolean => {
    const result = planCommit(store.getState().draft);
    if (result.status === "invalid") {
      store.getState().actions.revealInvalid();
      return false;
    }
    const { setFilterState, setSearchQuery, setSearchType } = applyRef.current;
    setFilterState(result.filters);
    setSearchQuery(result.searchQuery);
    setSearchType(result.searchType);
    if (result.canonical.length > 0) {
      recordRecentSearch(projectId, result.canonical);
    }
    return true;
  }, [store, projectId]);

  return { store, commit };
}
