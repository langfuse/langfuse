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

  const columnFilters = columnFiltersState as Record<string, FilterState>;

  const updateColumnFilters = (columnId: string, filters: FilterState) => {
    const newFilters = { ...columnFilters, [columnId]: filters };
    if (filters.length === 0) {
      delete newFilters[columnId]; // Clean up empty filters
    }
    setColumnFiltersState(newFilters);
  };

  const getFiltersForColumnById = (columnId: string): FilterState => {
    return columnFilters?.[columnId] ?? [];
  };

  return {
    columnFilters,
    updateColumnFilters,
    getFiltersForColumnById,
  } as const;
};
