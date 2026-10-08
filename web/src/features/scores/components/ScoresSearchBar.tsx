import type { FilterState } from "@langfuse/shared";
import { useMemo } from "react";
import type { FilterConfig } from "@/src/features/filters";
import {
  type ComposerSize,
  TableSearchBar,
  toObservedOptions,
} from "@/src/features/search-bar";

import { scoresFieldRegistry } from "@/src/features/scores/constants/scoresSearchRegistry";

export function ScoresSearchBar({
  projectId,
  isV4,
  filterConfig,
  filterState,
  setFilterState,
  filterOptions,
  isLoading,
  inset = false,
  size = "default",
}: {
  projectId: string;
  isV4: boolean;
  filterConfig: FilterConfig;
  filterState: FilterState;
  setFilterState: (filters: FilterState) => void;
  filterOptions: Parameters<typeof toObservedOptions>[0];
  isLoading: boolean;
  inset?: boolean;
  size?: ComposerSize;
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
      inset={inset}
      size={size}
    />
  );
}
