import type { FilterState, TracingSearchType } from "@langfuse/shared";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";

const preserveHostSearchScope = () => {};

export function useEventsTableSearch({
  useHostSearchScopes,
  ...options
}: Parameters<typeof useEventsSearchBar>[0] & {
  useHostSearchScopes: boolean;
}) {
  const searchBar = useEventsSearchBar({
    ...options,
    searchType: useHostSearchScopes ? DEFAULT_SEARCH_TYPE : options.searchType,
    analyticsSearchType: useHostSearchScopes
      ? options.searchType
      : options.analyticsSearchType,
    setSearchType: useHostSearchScopes
      ? preserveHostSearchScope
      : options.setSearchType,
  });

  const resetDraft = (state: {
    filters: FilterState;
    searchQuery: string | null;
    searchType: TracingSearchType[];
  }) => {
    searchBar.resetDraft({
      ...state,
      searchType: useHostSearchScopes ? DEFAULT_SEARCH_TYPE : state.searchType,
    });
  };

  return { ...searchBar, resetDraft };
}
