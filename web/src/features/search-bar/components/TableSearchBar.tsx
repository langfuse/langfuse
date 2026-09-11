import type { FilterState, TracingSearchType } from "@langfuse/shared";
import { EventsSearchBarRow } from "./EventsSearchBarRow";
import { useEventsSearchBar } from "../hooks/useEventsSearchBar";
import { DEFAULT_SEARCH_TYPE } from "../lib/commit";
import type { FieldRegistry } from "../lib/fields";
import type { ObservedOptions } from "../lib/observed-options";

const noSearchLane = () => {};

export function TableSearchBar({
  projectId,
  tableName,
  registry,
  filterState,
  setFilterState,
  observed,
  isV4,
  search,
  onRequestColumns,
  erroredColumns,
}: {
  projectId?: string;
  tableName: string;
  registry: FieldRegistry;
  filterState: FilterState;
  setFilterState: (filters: FilterState) => void;
  observed: ObservedOptions | undefined;
  isV4: boolean;
  search?: {
    query: string | null;
    type?: TracingSearchType[];
    setQuery: (query: string | null) => void;
    setType?: (type: TracingSearchType[]) => void;
  };
  onRequestColumns?: (columns: readonly string[]) => void;
  erroredColumns?: ReadonlySet<string>;
}) {
  // The host owns the applied query and scope; the bar edits both together.
  const { store, commit, applyFilters } = useEventsSearchBar({
    projectId,
    tableName,
    registry,
    enabled: true,
    isV4,
    filterState,
    setFilterState,
    observed,
    searchQuery: search?.query ?? null,
    setSearchQuery: search?.setQuery ?? noSearchLane,
    searchType: search?.type ?? DEFAULT_SEARCH_TYPE,
    analyticsSearchType: search?.setType ? undefined : (search?.type ?? []),
    setSearchType: search?.setType ?? noSearchLane,
  });

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <EventsSearchBarRow
          projectId={projectId}
          tableName={tableName}
          registry={registry}
          isV4={isV4}
          store={store}
          commit={commit}
          observed={observed}
          onApplyFilters={applyFilters}
          onRequestColumns={onRequestColumns}
          erroredColumns={erroredColumns}
        />
      </div>
    </div>
  );
}
