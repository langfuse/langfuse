import { type FilterState } from "@langfuse/shared";
import { useMemo } from "react";
import { useQueryParam, JsonParam, withDefault } from "use-query-params";

const columnFiltersParam = withDefault(
  JsonParam,
  {} as Record<string, FilterState>,
);

/**
 * Hook for managing per-column filter state with URL persistence
 * Uses JsonParam for automatic JSON encoding/decoding
 * Similar to existing useQueryFilterState but for multiple runs
 */
export const useColumnFilterState = () => {
  // Use JsonParam for automatic JSON encoding/decoding of complex objects
  const [columnFiltersState, setColumnFiltersState] = useQueryParam(
    "columnFilters",
    columnFiltersParam,
  );

  const updateColumnFilters = (columnId: string, filters: FilterState) => {
    const newFilters = { ...columnFiltersState, [columnId]: filters };
    if (filters.length === 0) {
      delete newFilters[columnId]; // Clean up empty filters
    }
    setColumnFiltersState(newFilters);
  };

  const getFiltersForColumnById = (columnId: string): FilterState => {
    return columnFiltersState?.[columnId] ?? [];
  };

  const columnFilterList = useMemo(
    () =>
      Object.entries((columnFiltersState ?? {}) as Record<string, FilterState>)
        .filter(([, filters]) => filters.length > 0)
        .map(([runId, filters]) => ({ runId, filters })),
    [columnFiltersState],
  );

  return {
    columnFilters: columnFiltersState,
    updateColumnFilters,
    getFiltersForColumnById,
    columnFilterList,
  } as const;
};
