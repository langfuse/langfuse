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
import {
  type ObservedOptions,
  scoreTypeContextFromObserved,
} from "@/src/features/search-bar/lib/observed-options";
import { recordRecentSearch } from "@/src/features/search-bar/lib/recent-searches";
import {
  createSearchBarStore,
  type SearchBarStore,
} from "@/src/features/search-bar/store/searchBarStore";

/** Order-independent scope-set equality (scopes are unique). */
function sameScopes(a: TracingSearchType[], b: TracingSearchType[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((s) => bs.has(s));
}

/**
 * The resting draft carries a trailing space when non-empty — the "ready for the
 * next filter" affordance. Baking it into the DERIVED committed text (and the
 * value `commit` returns) means it is present from the first paint, so clicking
 * past the text — or landing after a commit — never has to MUTATE the draft to
 * insert it. Mutating on click flickered the caret from inside the last pill to
 * after a freshly-inserted space. It is trimmed on the next commit (planCommit)
 * and ignored by resetTo's AST compare, so it never reaches the filter state and
 * never loops.
 */
function restingDraft(text: string): string {
  return text.length === 0 ? text : `${text} `;
}

/** Column + key identity, so keyed filters (metadata.<k>, scores.<k>) on the
 *  same column don't collide while plain columns dedupe by column alone. */
function filterIdentity(f: FilterState[number]): string {
  return `${f.column}\u0000${"key" in f ? f.key : ""}`;
}

export function useEventsSearchBar({
  projectId,
  enabled,
  filterState,
  searchQuery,
  searchType,
  observed,
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
  /** Observed filter options — used to route `scores.<name>` by score type. */
  observed: ObservedOptions | undefined;
  setFilterState: (filters: FilterState) => void;
  setSearchQuery: (query: string | null) => void;
  setSearchType: (type: TracingSearchType[]) => void;
}): {
  store: SearchBarStore;
  commit: () => string | null;
  applyFilters: (filters: FilterState) => void;
} {
  // Latest observed options, read inside commit and by the store's draft
  // validation so both route `scores.<name>` by the same observed score type.
  const observedRef = useRef(observed);
  observedRef.current = observed;

  const [store] = useState(() =>
    createSearchBarStore(() =>
      scoreTypeContextFromObserved(observedRef.current),
    ),
  );

  // Committed query DERIVED from the single source of truth (pure). `skipped`
  // are filters that have no grammar form — the bar can't show them, so they
  // must be preserved across a commit instead of being silently wiped.
  const derived = useMemo(
    () => filterStateToQueryText(filterState, { searchQuery, searchType }),
    [filterState, searchQuery, searchType],
  );
  const committedText = restingDraft(derived.text);
  const skippedFiltersRef = useRef(derived.skippedFilters);
  skippedFiltersRef.current = derived.skippedFilters;

  // The one external→local sync: seed the draft whenever the committed
  // baseline changes (a commit echo, a sidebar edit, a saved view, or
  // navigation). resetTo is a no-op when the draft already matches, so a
  // commit's own echo settles immediately without clobbering the caret.
  useEffect(() => {
    if (!enabled) return;
    store.getState().actions.resetTo(committedText);
  }, [enabled, committedText, store]);

  // Re-validate when observed options load: a draft typed before score types
  // were known has a stale draftValid (the editor's red-border gate reads it),
  // so without this a `scores.<numeric>:<non-number>` typed during the load
  // window would commit-reject with no visible error. `observed` identity is
  // NOT stable across refetches (a relative range + auto-refresh rebuilds it
  // every tick), so this can fire on ticks where the score types are unchanged
  // — revalidate() bails on a set-equal context, keeping that path a no-op.
  useEffect(() => {
    if (!enabled) return;
    store.getState().actions.revalidate();
  }, [enabled, observed, store]);

  // Latest applied-state setters, read inside commit without rebuilding it.
  const applyRef = useRef({ setFilterState, setSearchQuery, setSearchType });
  applyRef.current = { setFilterState, setSearchQuery, setSearchType };

  // Latest searchType, so commit can skip writing an unchanged value.
  const searchTypeRef = useRef(searchType);
  searchTypeRef.current = searchType;

  // Re-attach the filters the grammar can't represent so neither a grammar
  // commit nor an AI apply ever drops them (no-silent-drop contract) — but drop
  // any skipped filter whose (column, key) the new set just produced, so an
  // explicit edit replaces it instead of duplicating the column in URL state.
  const mergeWithSkipped = useCallback((filters: FilterState): FilterState => {
    const producedKeys = new Set(filters.map((f) => filterIdentity(f)));
    const preserved = skippedFiltersRef.current.filter(
      (f) => !producedKeys.has(filterIdentity(f)),
    );
    return preserved.length > 0 ? [...filters, ...preserved] : filters;
  }, []);

  // Apply an externally-produced filter set (the AI filter generator) the same
  // way a commit does — preserving skipped filters — instead of a raw replace
  // that would silently drop them. AI returns only filters (no free text), so
  // searchQuery/searchType are untouched.
  const applyFilters = useCallback(
    (filters: FilterState) => {
      applyRef.current.setFilterState(mergeWithSkipped(filters));
    },
    [mergeWithSkipped],
  );

  const commit = useCallback((): string | null => {
    const result = planCommit(
      store.getState().draft,
      scoreTypeContextFromObserved(observedRef.current),
    );
    if (result.status === "invalid") {
      store.getState().actions.revealInvalid();
      return null;
    }
    const { setFilterState, setSearchQuery, setSearchType } = applyRef.current;
    // Re-attach the filters the grammar can't represent so the commit never
    // drops them (no-silent-drop contract; shared with the AI apply path).
    const committedFilters = mergeWithSkipped(result.filters);
    setFilterState(committedFilters);
    setSearchQuery(result.searchQuery);
    // Only write searchType when it actually changed. planCommit coerces a
    // draft with no scope token to the default (`["id","content"]` — ids+names
    // +input+output); the bar's default deliberately differs from the legacy
    // toolbar's `["id"]`, so it IS written to the URL (that's how the content
    // lane persists). The guard just avoids a redundant rewrite when unchanged.
    if (!sameScopes(result.searchType, searchTypeRef.current)) {
      setSearchType(result.searchType);
    }
    if (result.canonical.length > 0) {
      recordRecentSearch(projectId, result.canonical);
    }
    // Return the CANONICAL committed text in its RESTING form (trailing space) —
    // exactly what the resetTo effect re-derives on the next render (same
    // filters + searchQuery/searchType). The composer drops the caret after it,
    // so the echo string-compares equal and the space survives even when the
    // commit reorders the query (e.g. `refund level:ERROR` → `level:ERROR refund`).
    return restingDraft(
      filterStateToQueryText(committedFilters, {
        searchQuery: result.searchQuery,
        searchType: result.searchType,
      }).text,
    );
  }, [store, projectId, mergeWithSkipped]);

  return { store, commit, applyFilters };
}
