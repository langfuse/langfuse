import { type FilterState } from "@langfuse/shared";
import { useQueryParam, JsonParam, withDefault } from "use-query-params";

/**
 * Hook for managing per-column filter state with URL persistence
 * Uses JsonParam for automatic JSON encoding/decoding
 * Similar to existing useQueryFilterState but for multiple runs
 */
export const useColumnFilterState = () => {
  // Use JsonParam for automatic JSON encoding/decoding of complex objects
  const [columnFiltersState, setColumnFiltersState] = useQueryParam(
    "columnFilters",
    withDefault(JsonParam, {} as Record<string, FilterState>),
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

  // Transform object to array format
  const convertToColumnFilterList = (): {
    runId: string;
    filters: FilterState;
  }[] => {
    const filters = columnFiltersState as Record<string, FilterState>;
    return Object.entries(filters ?? {})
      .filter(([_, filterArray]) => filterArray.length > 0)
      .map(([runId, filterArray]) => ({ runId, filters: filterArray }));
  };

  return {
    columnFilters: columnFiltersState,
    updateColumnFilters,
    getFiltersForColumnById,
    convertToColumnFilterList,
  } as const;
};
