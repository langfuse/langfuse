import {
  extractEventsLuceneFlatFilterState,
  getEventsLuceneSerializableFilterState,
  resolveEventsLuceneQueryForApi,
  serializeEventsLuceneFilterState,
  type FilterState,
} from "@langfuse/shared";
import isEqual from "lodash/isEqual";

export function getEffectiveEventsSearchQueryForSync(params: {
  latestSearchQuery: string | null | undefined;
  urlSearchQuery: string | null | undefined;
}): string {
  const latestSearchQuery = params.latestSearchQuery?.trim();

  if (latestSearchQuery !== undefined) {
    return latestSearchQuery;
  }

  return params.urlSearchQuery?.trim() ?? "";
}

function removeMatchingFilters(
  filters: FilterState,
  filtersToRemove: FilterState | undefined,
): FilterState {
  if (!filtersToRemove || filtersToRemove.length === 0) {
    return filters;
  }

  const remainingFilters = [...filters];

  for (const filterToRemove of filtersToRemove) {
    const matchingIndex = remainingFilters.findIndex((candidateFilter) =>
      isEqual(candidateFilter, filterToRemove),
    );

    if (matchingIndex >= 0) {
      remainingFilters.splice(matchingIndex, 1);
    }
  }

  return remainingFilters;
}

export function getSyncableEventsLuceneFilterState(
  searchQuery: string | null | undefined,
): FilterState | undefined {
  const resolvedSearchQuery = resolveEventsLuceneQueryForApi(searchQuery);

  if (
    !resolvedSearchQuery.isValid ||
    resolvedSearchQuery.searchQuery ||
    !resolvedSearchQuery.filter
  ) {
    return undefined;
  }

  const flattenedFilterState = extractEventsLuceneFlatFilterState(
    resolvedSearchQuery.filter,
  );

  if (!flattenedFilterState) {
    return undefined;
  }

  return serializeEventsLuceneFilterState(flattenedFilterState)
    ? flattenedFilterState
    : undefined;
}

export function getEventsSidebarDisabledReason(
  searchQuery: string | null | undefined,
): string | undefined {
  const resolvedSearchQuery = resolveEventsLuceneQueryForApi(searchQuery);

  if (
    !resolvedSearchQuery.isValid ||
    resolvedSearchQuery.searchQuery ||
    !resolvedSearchQuery.filter
  ) {
    return undefined;
  }

  if (getSyncableEventsLuceneFilterState(searchQuery)) {
    return undefined;
  }

  return "Sidebar is disabled for complex search bar filters.";
}

export function planEventsSearchBarFilterSync(params: {
  currentExplicitFilters: FilterState;
  previousSyncedFilters?: FilterState;
  nextSearchQuery: string | null | undefined;
  hideControls: boolean;
}): {
  nextExplicitFilters: FilterState;
  nextSyncedFilters?: FilterState;
} {
  const {
    currentExplicitFilters,
    previousSyncedFilters,
    nextSearchQuery,
    hideControls,
  } = params;

  if (hideControls) {
    return {
      nextExplicitFilters: currentExplicitFilters,
      nextSyncedFilters: previousSyncedFilters,
    };
  }

  const nextSyncableFilters =
    getSyncableEventsLuceneFilterState(nextSearchQuery);

  if (nextSyncableFilters) {
    return {
      nextExplicitFilters: [
        ...removeMatchingFilters(currentExplicitFilters, previousSyncedFilters),
        ...nextSyncableFilters,
      ],
      nextSyncedFilters: nextSyncableFilters,
    };
  }

  if (previousSyncedFilters && previousSyncedFilters.length > 0) {
    return {
      nextExplicitFilters: removeMatchingFilters(
        currentExplicitFilters,
        previousSyncedFilters,
      ),
      nextSyncedFilters: undefined,
    };
  }

  return {
    nextExplicitFilters: currentExplicitFilters,
    nextSyncedFilters: previousSyncedFilters,
  };
}

export function planEventsSidebarSearchSync(params: {
  currentSearchQuery: string | null | undefined;
  nextExplicitFilters: FilterState;
  hideControls: boolean;
}): {
  shouldUpdateSearchQuery: boolean;
  nextSearchQuery: string;
  nextSyncedFilters?: FilterState;
} {
  const { currentSearchQuery, nextExplicitFilters, hideControls } = params;

  if (hideControls) {
    return {
      shouldUpdateSearchQuery: false,
      nextSearchQuery: "",
      nextSyncedFilters: undefined,
    };
  }

  const trimmedSearchQuery = currentSearchQuery?.trim() ?? "";
  const resolvedSearchQuery =
    resolveEventsLuceneQueryForApi(currentSearchQuery);

  if (
    trimmedSearchQuery &&
    (!resolvedSearchQuery.isValid ||
      Boolean(resolvedSearchQuery.searchQuery) ||
      !getSyncableEventsLuceneFilterState(currentSearchQuery))
  ) {
    return {
      shouldUpdateSearchQuery: false,
      nextSearchQuery: trimmedSearchQuery,
      nextSyncedFilters: undefined,
    };
  }

  const nextSyncedFilters =
    getEventsLuceneSerializableFilterState(nextExplicitFilters);
  const nextSearchQuery =
    serializeEventsLuceneFilterState(nextSyncedFilters) ?? "";

  return {
    shouldUpdateSearchQuery: true,
    nextSearchQuery,
    nextSyncedFilters:
      nextSyncedFilters.length > 0 ? nextSyncedFilters : undefined,
  };
}
