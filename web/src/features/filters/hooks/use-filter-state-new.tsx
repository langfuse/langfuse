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

// Helper to create boolean filter
const createBooleanFilter = (column: string, value: boolean) => ({
  column,
  type: "boolean" as const,
  operator: "=" as const,
  value,
});

// Helper to create string/array options filter
const createOptionsFilter = (column: string, values: string[]) => {
  const columnDef = tracesTableCols.find((col) => col.name === column);
  const filterType = columnDef?.type ?? "stringOptions";

  return {
    column,
    type: filterType as any,
    operator: "any of" as const,
    value: values,
  };
};

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
    const otherFilters = filterState.filter((f) => f.column !== column);

    // Handle special case: starred filter (checkbox → boolean)
    if (column === "bookmarked") {
      // Both or neither selected → no filter (show all)
      if (values.length === 0 || values.length === 2) {
        setFilterState(otherFilters);
        return;
      }

      // Only "Starred" → bookmarked = true
      if (values.includes("Starred")) {
        const newFilter = createBooleanFilter("bookmarked", true);
        setFilterState([...otherFilters, newFilter]);
        return;
      }

      // Only "Not starred" → bookmarked = false
      if (values.includes("Not starred")) {
        const newFilter = createBooleanFilter("bookmarked", false);
        setFilterState([...otherFilters, newFilter]);
        return;
      }

      return;
    }

    // Early return for invalid regular columns
    if (!(column in options)) return;

    // Handle regular filters
    const availableValues = options[column as keyof FilterQueryOptions];
    // Empty values = select all (prevents "none selected" state)
    const finalValues = values.length === 0 ? availableValues : values;

    setFilterState([...otherFilters, createOptionsFilter(column, finalValues)]);
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
