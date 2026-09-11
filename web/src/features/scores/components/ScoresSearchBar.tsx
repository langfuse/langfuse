import type { FilterState } from "@langfuse/shared";
import { useMemo } from "react";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { scoresFieldRegistry } from "@/src/features/scores/constants/scoresSearchRegistry";

export function ScoresSearchBar({
  projectId,
  isV4,
  filterConfig,
  filterState,
  setFilterState,
  filterOptions,
  isLoading,
}: {
  projectId: string;
  isV4: boolean;
  filterConfig: FilterConfig;
  filterState: FilterState;
  setFilterState: (filters: FilterState) => void;
  filterOptions: Parameters<typeof toObservedOptions>[0];
  isLoading: boolean;
}) {
  const registry = useMemo(
    () => scoresFieldRegistry(filterConfig),
    [filterConfig],
  );
  const observed = toObservedOptions(filterOptions, isLoading);
  return (
    <TableSearchBar
      projectId={projectId}
      tableName="scores"
      isV4={isV4}
      filterState={filterState}
      setFilterState={setFilterState}
      observed={observed}
      registry={registry}
    />
  );
}
