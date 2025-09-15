import { useMemo } from "react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { type FilterState, tracesTableCols } from "@langfuse/shared";
import {
  encodeFilters,
  decodeFilters,
  type FilterQueryOptions,
} from "../lib/filter-query-encoding";

// TODO: make type-safe
type UpdateFilter = (column: string, values: any) => void;

export function useQueryFilterStateNew(options: FilterQueryOptions) {
  const [filtersQuery, setFiltersQuery] = useQueryParam(
    "filternew",
    withDefault(StringParam, ""),
  );

  const filterState: FilterState = useMemo(() => {
    try {
      return decodeFilters(filtersQuery, options);
    } catch (error) {
      console.error("Error decoding filters:", error);
      return [];
    }
  }, [filtersQuery, options]);

  const setFilterState = (newFilters: FilterState) => {
    const encoded = encodeFilters(newFilters, options);
    setFiltersQuery(encoded || null);
  };

  const updateFilter: UpdateFilter = (column, values) => {
    if (!(column in options)) return;

    const availableValues = options[column as keyof FilterQueryOptions];
    // Empty values = select all (prevents "none selected" state)
    const finalValues = values.length === 0 ? availableValues : values;

    const otherFilters = filterState.filter((f) => f.column !== column);

    // Get filter type from table schema
    const columnDef = tracesTableCols.find((col) => col.name === column);
    const filterType = columnDef?.type || "stringOptions";

    const newFilters: FilterState = [
      ...otherFilters,
      {
        column: column,
        type: filterType,
        operator: "any of",
        value: finalValues,
      },
    ];

    setFilterState(newFilters);
  };

  const clearAll = () => {
    setFilterState([]);
  };

  return {
    filterState,
    updateFilter,
    clearAll,
    isFiltered: filterState.length > 0,
  };
}
