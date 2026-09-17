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
// The draft sync never writes back to applied state. A commit acknowledgment
// keeps separately updated host lanes from projecting a half-applied query.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import isEqual from "lodash/isEqual";

import type { FilterState, TracingSearchType } from "@langfuse/shared";

import {
  classifySearchError,
  planCommit,
} from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import {
  EVENTS_FIELD_REGISTRY,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";
import {
  type ObservedOptions,
  scoreTypeContextFromObserved,
} from "@/src/features/search-bar/lib/observed-options";
import { recordRecentSearch } from "@/src/features/search-bar/lib/recent-searches";
import {
  createSearchBarStore,
  type SearchBarStore,
} from "@/src/features/search-bar/store/searchBarStore";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

/** How a search-bar commit was triggered — the `trigger` analytics dimension. */
type SearchCommitTrigger = "enter" | "blur" | "pick";
type SearchCommitOptions = { replaceHidden?: boolean };
export type SearchCommit = (
  trigger?: SearchCommitTrigger,
  options?: SearchCommitOptions,
) => string | null;

/** Order-independent scope-set equality (scopes are unique). */
function sameScopes(a: TracingSearchType[], b: TracingSearchType[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((s) => bs.has(s));
}

type AppliedSearchState = {
  filters: FilterState;
  query: string | null;
  scopes: TracingSearchType[];
};
type PendingCommit = {
  previous: AppliedSearchState;
  next: AppliedSearchState;
  text: string;
};

function sameAppliedState(a: AppliedSearchState, b: AppliedSearchState) {
  return (
    isEqual(a.filters, b.filters) &&
    (a.query ?? "") === (b.query ?? "") &&
    sameScopes(a.scopes, b.scopes)
  );
}

function isPartialCommitEcho(
  state: AppliedSearchState,
  { previous, next }: PendingCommit,
) {
  return (
    (isEqual(state.filters, previous.filters) ||
      isEqual(state.filters, next.filters)) &&
    ((state.query ?? "") === (previous.query ?? "") ||
      (state.query ?? "") === (next.query ?? "")) &&
    (sameScopes(state.scopes, previous.scopes) ||
      sameScopes(state.scopes, next.scopes))
  );
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
  tableName,
  enabled,
  isV4 = true,
  filterState,
  searchQuery,
  searchType,
  analyticsSearchType,
  observed,
  setFilterState,
  setSearchQuery,
  setSearchType,
  registry = EVENTS_FIELD_REGISTRY,
}: {
  projectId?: string;
  /** Table this bar filters — the `tableName` analytics dimension. */
  tableName: string;
  enabled: boolean;
  isV4?: boolean;
  /** Search-bar projection of the user's explicit facet filters. */
  filterState: FilterState;
  searchQuery: string | null;
  searchType: TracingSearchType[];
  /** The host's applied scope when grammar projection uses a different scope. */
  analyticsSearchType?: TracingSearchType[];
  /** Observed filter options — used to route `scores.<name>` by score type. */
  observed: ObservedOptions | undefined;
  setFilterState: (filters: FilterState) => void;
  setSearchQuery: (query: string | null) => void;
  setSearchType: (type: TracingSearchType[]) => void;
  registry?: FieldRegistry;
}): {
  store: SearchBarStore;
  commit: SearchCommit;
  applyFilters: (filters: FilterState) => void;
  resetDraft: (state: {
    filters: FilterState;
    searchQuery: string | null;
    searchType: TracingSearchType[];
  }) => void;
} {
  const capture = usePostHogClientCapture();

  // Latest observed options, read inside commit and by the store's draft
  // validation so both route `scores.<name>` by the same observed score type.
  const observedRef = useRef(observed);
  observedRef.current = observed;
  const registryRef = useRef(registry);
  registryRef.current = registry;

  const [store] = useState(() =>
    createSearchBarStore(
      () => scoreTypeContextFromObserved(observedRef.current),
      () => registryRef.current,
    ),
  );

  const appliedState = {
    filters: filterState,
    query: searchQuery,
    scopes: searchType,
  };
  const appliedStateRef = useRef(appliedState);
  appliedStateRef.current = appliedState;
  const pendingCommitRef = useRef<PendingCommit | null>(null);
  const pending = pendingCommitRef.current;
  if (
    pending &&
    (sameAppliedState(appliedState, pending.next) ||
      !isPartialCommitEcho(appliedState, pending))
  ) {
    pendingCommitRef.current = null;
  }

  const cancelPendingCommit = useCallback(() => {
    pendingCommitRef.current = null;
  }, []);

  // Back/Forward is an explicit external navigation, even when it restores
  // exactly the values from before an unacknowledged commit.
  useEffect(() => {
    window.addEventListener("popstate", cancelPendingCommit);
    return () => window.removeEventListener("popstate", cancelPendingCommit);
  }, [cancelPendingCommit]);

  // Committed query DERIVED from the single source of truth (pure). `skipped`
  // are filters that have no grammar form — the bar can't show them, so they
  // must be preserved across a commit instead of being silently wiped.
  const derived = useMemo(
    () =>
      filterStateToQueryText(
        filterState,
        { searchQuery, searchType },
        registry,
      ),
    [filterState, registry, searchQuery, searchType],
  );
  const committedText =
    pendingCommitRef.current?.text ?? restingDraft(derived.text);
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

  // Re-validate when observed options or the registry load: a draft typed
  // before score types or dynamic allowed values were known has stale
  // draftValid. Their identities can rotate across refetches, so revalidate()
  // bails when both effective contexts are unchanged.
  useEffect(() => {
    if (!enabled) return;
    store.getState().actions.revalidate();
  }, [enabled, observed, registry, store]);

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

  const beginCommit = useCallback(
    (next: AppliedSearchState) => {
      const text = restingDraft(
        filterStateToQueryText(
          next.filters,
          { searchQuery: next.query, searchType: next.scopes },
          registry,
        ).text,
      );
      pendingCommitRef.current = {
        previous: appliedStateRef.current,
        next,
        text,
      };
      return text;
    },
    [registry],
  );

  const resetDraft = useCallback(
    (state: {
      filters: FilterState;
      searchQuery: string | null;
      searchType: TracingSearchType[];
    }) => {
      const text = beginCommit({
        filters: state.filters,
        query: state.searchQuery,
        scopes: state.searchType,
      });
      store.getState().actions.setDraft(text);
    },
    [beginCommit, store],
  );

  // Apply an externally-produced filter set (the AI filter generator) the same
  // way a commit does — preserving skipped filters — instead of a raw replace
  // that would silently drop them. The model receives the bar's full committed
  // text as refine context (free text rendered inline) and returns the COMPLETE
  // updated FilterState, so applying it must write all three URL lanes like a
  // grammar commit does: anything the model didn't re-emit is dropped, including
  // the free text. Clearing searchQuery / resetting searchType to the default is
  // what makes "drop the free text" actually stick — otherwise the stale
  // searchQuery survives and resetTo re-derives it back into the bar.
  const applyFilters = useCallback(
    (filters: FilterState) => {
      const { setFilterState, setSearchQuery, setSearchType } =
        applyRef.current;
      const committedFilters = mergeWithSkipped(filters);
      beginCommit({
        filters: committedFilters,
        query: null,
        scopes: [...registry.defaultSearchType],
      });
      setFilterState(committedFilters);
      setSearchQuery(null);
      if (!sameScopes([...registry.defaultSearchType], searchTypeRef.current)) {
        setSearchType([...registry.defaultSearchType]);
      }
    },
    [beginCommit, mergeWithSkipped, registry],
  );

  // The committed text at the last render — the dedup baseline so a blur that
  // changed nothing does not emit a phantom `filters:search_submitted`.
  const committedTextRef = useRef(committedText);
  committedTextRef.current = committedText;

  // The draft that last emitted a `filters:search_error`, so a blur that
  // re-fails the SAME input does not double-emit (an explicit enter/pick retry
  // still counts — a repeated attempt is signal).
  const lastErrorTextRef = useRef<string | null>(null);

  const commit = useCallback(
    (
      trigger: SearchCommitTrigger = "enter",
      options: SearchCommitOptions = {},
    ): string | null => {
      const draftText = store.getState().draft;
      const result = planCommit(
        draftText,
        scoreTypeContextFromObserved(observedRef.current),
        registry,
      );
      if (result.status === "invalid") {
        store.getState().actions.revealInvalid();
        // Report diagnostic metadata and query length, never query text.
        // A blur that rejects the same draft twice is deduplicated.
        const trimmed = draftText.trim();
        const isBlurRefail =
          trigger === "blur" && draftText === lastErrorTextRef.current;
        if (trimmed.length > 0 && !isBlurRefail) {
          const { orAttempted, reason } = classifySearchError(
            result.ast,
            result.diagnostics,
          );
          capture("filters:search_error", {
            tableName,
            orAttempted,
            reason,
            queryLength: trimmed.length,
            trigger,
            isV4,
          });
        }
        lastErrorTextRef.current = draftText;
        return null;
      }
      // A valid commit clears the error-dedup baseline so a later re-failure of
      // the same text still emits.
      lastErrorTextRef.current = null;
      const { setFilterState, setSearchQuery, setSearchType } =
        applyRef.current;
      // Ordinary grammar edits preserve filters the grammar cannot represent.
      // Complete-query replacements can explicitly clear those hidden filters
      // instead of silently carrying old scope.
      const committedFilters = options.replaceHidden
        ? result.filters
        : mergeWithSkipped(result.filters);
      // Register the full write before the optimistic filter setter can render
      // ahead of the URL-backed search query or scope setters.
      const committed = beginCommit({
        filters: committedFilters,
        query: result.searchQuery,
        scopes: result.searchType,
      });
      setFilterState(committedFilters);
      setSearchQuery(result.searchQuery);
      // Commit the scope alongside the query, without redundant URL writes.
      if (!sameScopes(result.searchType, searchTypeRef.current)) {
        setSearchType(result.searchType);
      }
      if (projectId && result.canonical.length > 0) {
        recordRecentSearch(projectId, result.canonical);
      }
      // Report query shape and length, never text. An unchanged blur is a
      // no-op; an explicit submission counts even for the same query.
      if (trigger !== "blur" || committed !== committedTextRef.current) {
        capture("filters:search_submitted", {
          tableName,
          filterCount: committedFilters.length,
          hasFreeText: (result.searchQuery ?? "").trim().length > 0,
          searchType: analyticsSearchType ?? result.searchType,
          searchScopes: Array.from(
            new Set([
              ...((result.searchQuery ?? "").trim()
                ? (analyticsSearchType ?? result.searchType)
                : []),
              ...result.filters.flatMap((filter) =>
                filter.column === "input" || filter.column === "output"
                  ? [filter.column]
                  : [],
              ),
            ]),
          ),
          queryLength: committed.trim().length,
          trigger,
          isV4,
        });
      }

      committedTextRef.current = committed;

      return committed;
    },
    [
      store,
      projectId,
      tableName,
      mergeWithSkipped,
      capture,
      registry,
      isV4,
      analyticsSearchType,
      beginCommit,
    ],
  );

  return { store, commit, applyFilters, resetDraft };
}
