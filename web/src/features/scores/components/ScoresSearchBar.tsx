import type { FilterState } from "@langfuse/shared";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { SCORES_FIELD_REGISTRY } from "@/src/features/scores/constants/scoresSearchRegistry";

export function ScoresSearchBar({
  projectId,
  isV4,
  filterState,
  setFilterState,
  filterOptions,
  isLoading,
}: {
  projectId: string;
  isV4: boolean;
  filterState: FilterState;
  setFilterState: (filters: FilterState) => void;
  filterOptions: Parameters<typeof toObservedOptions>[0];
  isLoading: boolean;
}) {
  const observed = toObservedOptions(filterOptions, isLoading);
  return (
    <TableSearchBar
      projectId={projectId}
      tableName="scores"
      isV4={isV4}
      filterState={filterState}
      setFilterState={setFilterState}
      observed={observed}
      registry={SCORES_FIELD_REGISTRY}
    />
  );
}
