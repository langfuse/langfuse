import { useMemo } from "react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { type FilterState, tracesTableCols } from "@langfuse/shared";
import {
  encodeFilters,
  decodeFilters,
  type FilterQueryOptions,
} from "../lib/filter-query-encoding";

// TODO: make type-safe
type UpdateFilter = (
  column: string,
  values: any,
  operator?: "any of" | "none of",
) => void;

// Helper to create boolean filter
const createBooleanFilter = (column: string, value: boolean) => ({
  column,
  type: "boolean" as const,
  operator: "=" as const,
  value,
});

// Helper to create string/array options filter
const createOptionsFilter = (
  column: string,
  values: string[],
  operator: "any of" | "none of" = "any of",
) => {
  const columnDef = tracesTableCols.find((col) => col.name === column);
  const filterType = columnDef?.type ?? "stringOptions";

  return {
    column,
    type: filterType as any,
    operator: operator as const,
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

  const updateFilter: UpdateFilter = (
    column,
    values,
    operator?: "any of" | "none of",
  ) => {
    const otherFilters = filterState.filter((f) => f.column !== column);

    // Handle special case: starred filter (checkbox → boolean)
    if (column === "bookmarked") {
      // Both or neither selected → no filter (show all)
      if (values.length === 0 || values.length === 2) {
        setFilterState(otherFilters);
        return;
      }

      // Only "Bookmarked" → bookmarked = true
      if (values.includes("Bookmarked")) {
        const newFilter = createBooleanFilter("bookmarked", true);
        setFilterState([...otherFilters, newFilter]);
        return;
      }

      // Only "Not bookmarked" → bookmarked = false
      if (values.includes("Not bookmarked")) {
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

    // If all values are selected or none are selected, remove the filter (show all)
    if (
      values.length === 0 ||
      (values.length === availableValues.length &&
        availableValues.every((val) => values.includes(val)))
    ) {
      setFilterState(otherFilters);
      return;
    }

    // Determine operator and values based on context
    let finalOperator: "any of" | "none of";
    let finalValues: string[];

    if (operator) {
      // Explicit operator provided (from "Only" button)
      finalOperator = operator;
      finalValues = values;
    } else {
      // Smart logic: if more than half are selected, use exclusive mode with deselected items
      if (values.length > availableValues.length / 2) {
        finalOperator = "none of";
        finalValues = availableValues.filter((val) => !values.includes(val));
      } else {
        finalOperator = "any of";
        finalValues = values;
      }
    }

    setFilterState([
      ...otherFilters,
      createOptionsFilter(column, finalValues, finalOperator),
    ]);
  };

  const updateFilterOnly = (column: string, value: string) => {
    // For "only this" behavior - always use "any of" operator with single value
    if (column === "bookmarked") {
      // Handle bookmarked specially
      updateFilter(column, [value]);
      return;
    }

    if (!(column in options)) return;
    updateFilter(column, [value], "any of");
  };

  const clearAll = () => {
    setFilterState([]);
  };

  return {
    filterState,
    updateFilter,
    updateFilterOnly,
    clearAll,
    isFiltered: filterState.length > 0,
  };
}
