import type { FilterState } from "@langfuse/shared";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { SCORES_FIELD_REGISTRY } from "@/src/features/scores/constants/scoresSearchRegistry";

const noSearchLane = () => {};

export function ScoresSearchBar({
  projectId,
  filterState,
  setFilterState,
  filterOptions,
  isLoading,
}: {
  projectId: string;
  filterState: FilterState;
  setFilterState: (filters: FilterState) => void;
  filterOptions: Parameters<typeof toObservedOptions>[0];
  isLoading: boolean;
}) {
  const observed = toObservedOptions(filterOptions, isLoading);
  const { store, commit, applyFilters } = useEventsSearchBar({
    projectId,
    tableName: "scores",
    enabled: true,
    filterState,
    searchQuery: null,
    searchType: DEFAULT_SEARCH_TYPE,
    observed,
    setFilterState,
    setSearchQuery: noSearchLane,
    setSearchType: noSearchLane,
    registry: SCORES_FIELD_REGISTRY,
  });

  return (
    <EventsSearchBarRow
      projectId={projectId}
      tableName="scores"
      store={store}
      commit={commit}
      observed={observed}
      onApplyFilters={applyFilters}
      registry={SCORES_FIELD_REGISTRY}
    />
  );
}
