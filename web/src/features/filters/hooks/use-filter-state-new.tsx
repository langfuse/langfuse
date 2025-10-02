import { useCallback, useMemo } from "react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { type FilterState, singleFilter } from "@langfuse/shared";
import {
  computeSelectedValues,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
} from "../lib/filter-query-encoding";
import useSessionStorage from "@/src/components/useSessionStorage";
import type { FilterConfig } from "../lib/filter-config";

function computeNumericRange(
  column: string,
  filterState: FilterState,
  defaultMin: number,
  defaultMax: number,
): [number, number] {
  const minFilter = filterState.find(
    (f) => f.column === column && f.type === "number" && f.operator === ">=",
  );
  const maxFilter = filterState.find(
    (f) => f.column === column && f.type === "number" && f.operator === "<=",
  );

  const minValue =
    minFilter && typeof minFilter.value === "number"
      ? minFilter.value
      : defaultMin;
  const maxValue =
    maxFilter && typeof maxFilter.value === "number"
      ? maxFilter.value
      : defaultMax;

  return [minValue, maxValue];
}

export interface BaseUIFilter {
  column: string;
  label: string;
  shortKey: string | null;
  loading: boolean;
  expanded: boolean;
  isActive: boolean;
  onReset: () => void;
}

export interface CategoricalUIFilter extends BaseUIFilter {
  type: "categorical";
  value: string[];
  options: string[];
  counts: Map<string, number>;
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
}

export interface NumericUIFilter extends BaseUIFilter {
  type: "numeric";
  value: [number, number];
  min: number;
  max: number;
  onChange: (value: [number, number]) => void;
  unit?: string;
}

export interface StringUIFilter extends BaseUIFilter {
  type: "string";
  value: string;
  onChange: (value: string) => void;
}

export type UIFilter = CategoricalUIFilter | NumericUIFilter | StringUIFilter;

const EMPTY_MAP: Map<string, number> = new Map();

type UpdateFilter = (
  column: string,
  values: string[],
  operator?: "any of" | "none of",
) => void;

export function useQueryFilterState(
  config: FilterConfig,
  options: Record<string, string[]>,
) {
  const FILTER_EXPANDED_STORAGE_KEY = `${config.tableName}-filters-expanded`;
  const DEFAULT_EXPANDED_FILTERS = config.defaultExpanded ?? [];

  const [expandedString, setExpandedString] = useSessionStorage<string>(
    FILTER_EXPANDED_STORAGE_KEY,
    DEFAULT_EXPANDED_FILTERS.join(","),
  );
  const expandedState = useMemo(() => {
    return expandedString.split(",").filter(Boolean);
  }, [expandedString]);
  const onExpandedChange = useCallback(
    (value: string[]) => {
      setExpandedString(value.join(","));
    },
    [setExpandedString],
  );

  const [filtersQuery, setFiltersQuery] = useQueryParam(
    "filternew",
    withDefault(StringParam, ""),
  );

  const filterState: FilterState = useMemo(() => {
    try {
      const filters = decodeFiltersGeneric(
        filtersQuery,
        config.columnToQueryKey,
        options,
        (column) => {
          const columnDef = config.columnDefinitions.find(
            (col) => col.id === column,
          );
          return columnDef?.type || "stringOptions";
        },
      );

      // Validate filters
      const result: FilterState = [];
      for (const filter of filters) {
        const validationResult = singleFilter.safeParse(filter);
        if (validationResult.success) {
          result.push(validationResult.data);
        } else {
          console.warn(
            `Invalid filter skipped:`,
            filter,
            validationResult.error,
          );
        }
      }
      return result;
    } catch (error) {
      console.error("Error decoding filters:", error);
      return [];
    }
  }, [
    filtersQuery,
    config.columnToQueryKey,
    config.columnDefinitions,
    options,
  ]);

  const setFilterState = useCallback(
    (newFilters: FilterState) => {
      const encoded = encodeFiltersGeneric(
        newFilters,
        config.columnToQueryKey,
        options,
      );
      setFiltersQuery(encoded || null);
    },
    [config.columnToQueryKey, options, setFiltersQuery],
  );

  const clearAll = () => {
    setFilterState([]);
  };

  // Generic apply selection logic
  const applySelection = useCallback(
    (
      current: FilterState,
      column: string,
      values: string[],
      operator?: "any of" | "none of",
    ): FilterState => {
      const other = current.filter((f) => f.column !== column);

      const facet = config.facets.find((f) => f.column === column);
      if (!facet) return current;

      const colDef = config.columnDefinitions.find(
        (c) => c.id === column || c.name === column,
      );
      const colType = colDef?.type;

      // Handle boolean facets
      if (facet.type === "boolean") {
        const trueLabel = facet.trueLabel ?? "True";
        const falseLabel = facet.falseLabel ?? "False";

        if (values.length === 0 || values.length === 2) return other;
        if (values.includes(trueLabel)) {
          return [
            ...other,
            {
              column,
              type: "boolean" as const,
              operator: "=" as const,
              value: true,
            },
          ];
        }
        if (values.includes(falseLabel)) {
          return [
            ...other,
            {
              column,
              type: "boolean" as const,
              operator: "=" as const,
              value: false,
            },
          ];
        }
        return other;
      }

      // Handle numeric facets
      if (facet.type === "numeric") {
        return other;
      }

      // Handle categorical facets
      if (!(column in options)) return current;
      const availableValues = options[column];

      if (
        values.length === 0 ||
        (values.length === availableValues.length &&
          availableValues.every((v) => values.includes(v)))
      ) {
        return other;
      }

      const finalOperator: "any of" | "none of" = operator ?? "any of";
      const filterType: "arrayOptions" | "stringOptions" =
        colType === "arrayOptions" ? "arrayOptions" : "stringOptions";

      if (filterType === "arrayOptions") {
        return [
          ...other,
          {
            column,
            type: "arrayOptions" as const,
            operator: finalOperator,
            value: values,
          },
        ];
      }

      return [
        ...other,
        {
          column,
          type: "stringOptions" as const,
          operator: finalOperator,
          value: values,
        },
      ];
    },
    [config, options],
  );

  const updateFilter: UpdateFilter = useCallback(
    (column, values, operator?: "any of" | "none of") => {
      const next = applySelection(filterState, column, values, operator);
      setFilterState(next);
    },
    [filterState, applySelection, setFilterState],
  );

  const updateFilterOnly = useCallback(
    (column: string, value: string) => {
      const facet = config.facets.find((f) => f.column === column);
      if (!facet) return;

      // Handle boolean specially
      if (facet.type === "boolean") {
        updateFilter(column, [value]);
        return;
      }

      if (!(column in options)) return;
      updateFilter(column, [value], "any of");
    },
    [config.facets, options, updateFilter],
  );

  const updateNumericFilter = useCallback(
    (
      column: string,
      value: [number, number],
      defaultMin: number,
      defaultMax: number,
    ) => {
      // Remove existing numeric filters for this column
      const withoutNumeric = filterState.filter((f) => f.column !== column);

      // Only add filters if values differ from defaults
      const filters: FilterState = [];
      if (value[0] !== defaultMin) {
        filters.push({
          column,
          type: "number" as const,
          operator: ">=" as const,
          value: value[0],
        });
      }
      if (value[1] !== defaultMax) {
        filters.push({
          column,
          type: "number" as const,
          operator: "<=" as const,
          value: value[1],
        });
      }

      const next: FilterState = [...withoutNumeric, ...filters];
      setFilterState(next);
    },
    [filterState, setFilterState],
  );

  const updateStringFilter = useCallback(
    (column: string, value: string) => {
      const withoutString = filterState.filter((f) => f.column !== column);

      if (value.trim() === "") {
        // Empty value means no filter
        setFilterState(withoutString);
      } else {
        // Add string filter with contains operator
        const next: FilterState = [
          ...withoutString,
          {
            column,
            type: "string" as const,
            operator: "contains" as const,
            value,
          },
        ];
        setFilterState(next);
      }
    },
    [filterState, setFilterState],
  );

  const filters: UIFilter[] = useMemo((): UIFilter[] => {
    const filterByColumn = new Map(filterState.map((f) => [f.column, f]));
    const expandedSet = new Set(expandedState);

    const getShortKey = (column: string): string | null => {
      return config.columnToQueryKey[column] ?? null;
    };

    return config.facets
      .map((facet): UIFilter | null => {
        if (facet.type === "numeric") {
          const currentRange = computeNumericRange(
            facet.column,
            filterState,
            facet.min,
            facet.max,
          );
          const isActive =
            currentRange[0] !== facet.min || currentRange[1] !== facet.max;
          return {
            type: "numeric",
            column: facet.column,
            label: facet.label,
            shortKey: getShortKey(facet.column),
            value: currentRange,
            min: facet.min,
            max: facet.max,
            unit: facet.unit,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            onChange: (value: [number, number]) =>
              updateNumericFilter(facet.column, value, facet.min, facet.max),
            onReset: () =>
              updateNumericFilter(
                facet.column,
                [facet.min, facet.max],
                facet.min,
                facet.max,
              ),
          };
        }

        // Handle string filters
        if (facet.type === "string") {
          const filterEntry = filterByColumn.get(facet.column);
          const currentValue =
            filterEntry?.type === "string" &&
            typeof filterEntry.value === "string"
              ? filterEntry.value
              : "";
          const isActive = currentValue.trim() !== "";

          return {
            type: "string",
            column: facet.column,
            label: facet.label,
            shortKey: getShortKey(facet.column),
            value: currentValue,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            onChange: (value: string) =>
              updateStringFilter(facet.column, value),
            onReset: () => updateStringFilter(facet.column, ""),
          };
        }

        // Handle boolean as categorical UI
        if (facet.type === "boolean") {
          const trueLabel = facet.trueLabel ?? "True";
          const falseLabel = facet.falseLabel ?? "False";
          const availableOptions = [trueLabel, falseLabel];
          const filterEntry = filterByColumn.get(facet.column);
          let selectedOptions = availableOptions;
          if (filterEntry) {
            const boolValue = filterEntry.value as boolean;
            selectedOptions = boolValue === true ? [trueLabel] : [falseLabel];
          }
          const isActive = selectedOptions.length === 1;

          return {
            type: "categorical",
            column: facet.column,
            label: facet.label,
            shortKey: getShortKey(facet.column),
            value: selectedOptions,
            options: availableOptions,
            counts: EMPTY_MAP,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            onChange: (values: string[]) => {
              if (values.length === 0 || values.length === 2) {
                updateFilter(facet.column, []);
                return;
              }
              if (values.includes(trueLabel) && !values.includes(falseLabel)) {
                updateFilter(facet.column, [trueLabel]);
              } else if (
                values.includes(falseLabel) &&
                !values.includes(trueLabel)
              ) {
                updateFilter(facet.column, [falseLabel]);
              }
            },
            onOnlyChange: (value: string) => {
              if (
                selectedOptions.length === 1 &&
                selectedOptions.includes(value)
              ) {
                updateFilter(facet.column, []);
              } else {
                updateFilter(facet.column, [value]);
              }
            },
            onReset: () => updateFilter(facet.column, []),
          };
        }

        // Handle categorical
        const availableValues = options[facet.column] ?? [];
        const selectedValues = computeSelectedValues(
          availableValues,
          filterByColumn.get(facet.column),
        );
        const isActive =
          selectedValues.length !== availableValues.length &&
          selectedValues.length > 0;

        return {
          type: "categorical",
          column: facet.column,
          label: facet.label,
          shortKey: getShortKey(facet.column),
          value: selectedValues,
          options: availableValues,
          counts: EMPTY_MAP,
          loading: false,
          expanded: expandedSet.has(facet.column),
          isActive,
          onChange: (values: string[]) => updateFilter(facet.column, values),
          onOnlyChange: (value: string) => {
            if (selectedValues.length === 1 && selectedValues.includes(value)) {
              updateFilter(
                facet.column,
                selectedValues.filter((v) => v !== value),
              );
            } else {
              updateFilterOnly(facet.column, value);
            }
          },
          onReset: () => updateFilter(facet.column, []),
        };
      })
      .filter((f): f is UIFilter => f !== null);
  }, [
    config,
    options,
    filterState,
    updateFilter,
    updateFilterOnly,
    updateNumericFilter,
    updateStringFilter,
    expandedState,
  ]);

  return {
    filterState,
    updateFilter,
    updateFilterOnly,
    clearAll,
    isFiltered: filterState.length > 0,
    filters,
    expanded: expandedState,
    onExpandedChange,
  };
}
