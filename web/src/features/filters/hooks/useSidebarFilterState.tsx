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

// Represents one active filter row in the key-value facet UI
// Example: key="accuracy", operator="any of", value=["good", "excellent"]
export type KeyValueFilterEntry = {
  key: string;
  operator: "any of" | "none of";
  value: string[];
};

// Represents one active numeric filter row in the numeric key-value facet UI
// Example: key="accuracy", operator=">=", value=0.8
export type NumericKeyValueFilterEntry = {
  key: string;
  operator: "=" | ">" | "<" | ">=" | "<=";
  value: number | "";
};

// Represents one active string filter row in the string key-value facet UI
// Example: key="environment", operator="=", value="production"
export type StringKeyValueFilterEntry = {
  key: string;
  operator: "=" | "contains" | "does not contain";
  value: string;
};

export interface KeyValueUIFilter extends BaseUIFilter {
  type: "keyValue";
  value: KeyValueFilterEntry[]; // Array of active filter rows
  keyOptions?: string[];
  availableValues: Record<string, string[]>;
  onChange: (filters: KeyValueFilterEntry[]) => void;
}

export interface NumericKeyValueUIFilter extends BaseUIFilter {
  type: "numericKeyValue";
  value: NumericKeyValueFilterEntry[]; // Array of active filter rows
  keyOptions?: string[];
  onChange: (filters: NumericKeyValueFilterEntry[]) => void;
}

export interface StringKeyValueUIFilter extends BaseUIFilter {
  type: "stringKeyValue";
  value: StringKeyValueFilterEntry[]; // Array of active filter rows
  keyOptions?: string[];
  onChange: (filters: StringKeyValueFilterEntry[]) => void;
}

export type UIFilter =
  | CategoricalUIFilter
  | NumericUIFilter
  | StringUIFilter
  | KeyValueUIFilter
  | NumericKeyValueUIFilter
  | StringKeyValueUIFilter;

const EMPTY_MAP: Map<string, number> = new Map();

type UpdateFilter = (
  column: string,
  values: string[],
  operator?: "any of" | "none of",
) => void;

export function useSidebarFilterState(
  config: FilterConfig,
  options: Record<string, string[] | Record<string, string[]>>,
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
    "filter",
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
      const availableValuesRaw = options[column];

      // For nested structures (keyValue filters), skip this logic
      if (!Array.isArray(availableValuesRaw)) {
        return current;
      }

      const availableValues = availableValuesRaw;

      // If all items selected or none selected, remove filter
      if (
        values.length === 0 ||
        (values.length === availableValues.length &&
          availableValues.every((v) => values.includes(v)))
      ) {
        return other;
      }

      // Determine operator and values based on context
      let finalOperator: "any of" | "none of";
      let finalValues: string[];

      if (operator !== undefined) {
        // Explicit operator provided (e.g., from "Only" button) - use as-is
        finalOperator = operator;
        finalValues = values;
      } else {
        // Checkbox interaction - smart operator selection
        const existingFilter = current.find((f) => f.column === column);

        if (!existingFilter) {
          // No existing filter - user is deselecting from "all selected" state
          // Use "none of" with deselected items
          const deselected = availableValues.filter((v) => !values.includes(v));
          finalOperator = "none of";
          finalValues = deselected;
        } else if (
          existingFilter.operator === "none of" &&
          (existingFilter.type === "stringOptions" ||
            existingFilter.type === "arrayOptions")
        ) {
          // Existing "none of" filter - keep "none of", update to deselected items
          const deselected = availableValues.filter((v) => !values.includes(v));
          finalOperator = "none of";
          finalValues = deselected;
        } else {
          // Existing "any of" filter or other - keep "any of" with selected items
          finalOperator = "any of";
          finalValues = values;
        }
      }

      const filterType: "arrayOptions" | "stringOptions" =
        colType === "arrayOptions" ? "arrayOptions" : "stringOptions";

      if (filterType === "arrayOptions") {
        return [
          ...other,
          {
            column,
            type: "arrayOptions" as const,
            operator: finalOperator,
            value: finalValues,
          },
        ];
      }

      return [
        ...other,
        {
          column,
          type: "stringOptions" as const,
          operator: finalOperator,
          value: finalValues,
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
      // Only apply for array-type options (not nested objects)
      const optionValue = options[column];
      if (!Array.isArray(optionValue)) return;
      updateFilter(column, [value], "any of");
    },
    [config.facets, options, updateFilter],
  );

  const updateNumericFilter = useCallback(
    (
      column: string,
      value: [number, number] | null,
      _defaultMin: number,
      _defaultMax: number,
    ) => {
      // Remove existing numeric filters for this column
      const withoutNumeric = filterState.filter((f) => f.column !== column);

      // If value is null, clear the filter (reset case)
      if (value === null) {
        setFilterState(withoutNumeric);
        return;
      }

      // Always add both filters when user interacts (even at min/max bounds)
      // This ensures the filter is marked as "active" and UI shows values
      const filters: FilterState = [
        {
          column,
          type: "number" as const,
          operator: ">=" as const,
          value: value[0],
        },
        {
          column,
          type: "number" as const,
          operator: "<=" as const,
          value: value[1],
        },
      ];

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
          // Check if there are any numeric filters for this column
          const isActive = filterState.some(
            (f) => f.column === facet.column && f.type === "number",
          );
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
              updateNumericFilter(facet.column, null, facet.min, facet.max),
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

        // Handle keyValue filters
        if (facet.type === "keyValue") {
          // Extract all categoryOptions filters for this column from filterState
          const categoryFilters = filterState.filter(
            (f) => f.column === facet.column && f.type === "categoryOptions",
          ) as Array<{
            column: string;
            type: "categoryOptions";
            operator: "any of" | "none of";
            key: string;
            value: string[];
          }>;

          // Convert to KeyValueFilterEntry array
          const activeFilters: KeyValueFilterEntry[] = categoryFilters.map(
            (f) => ({
              key: f.key,
              operator: f.operator,
              value: f.value,
            }),
          );

          const isActive = activeFilters.length > 0;

          // Get available values from options
          const availableValues = options[facet.column] ?? {};

          // Extract key options from availableValues if not defined in facet
          const keyOptions =
            facet.keyOptions ??
            (typeof availableValues === "object" &&
            !Array.isArray(availableValues)
              ? Object.keys(availableValues as Record<string, string[]>)
              : undefined);

          return {
            type: "keyValue",
            column: facet.column,
            label: facet.label,
            shortKey: getShortKey(facet.column),
            value: activeFilters,
            keyOptions,
            availableValues:
              typeof availableValues === "object" &&
              !Array.isArray(availableValues)
                ? (availableValues as Record<string, string[]>)
                : ({} as Record<string, string[]>),
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            onChange: (filters: KeyValueFilterEntry[]) => {
              // Remove all existing categoryOptions filters for this column
              const withoutCategory = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "categoryOptions"),
              );

              // Only add filters that have both key and values selected
              // This filters at the filterState level, not the UI level
              const validFilters = filters.filter(
                (entry) => entry.key && entry.value.length > 0,
              );

              const newFilters: FilterState = [
                ...withoutCategory,
                ...validFilters.map((entry) => ({
                  column: facet.column,
                  type: "categoryOptions" as const,
                  operator: entry.operator,
                  key: entry.key,
                  value: entry.value,
                })),
              ];

              setFilterState(newFilters);
            },
            onReset: () => {
              // Remove all categoryOptions filters for this column
              const newFilters = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "categoryOptions"),
              );
              setFilterState(newFilters);
            },
          };
        }

        // Handle numericKeyValue filters
        if (facet.type === "numericKeyValue") {
          // Extract all numberObject filters for this column from filterState
          const numericFilters = filterState.filter(
            (f) => f.column === facet.column && f.type === "numberObject",
          ) as Array<{
            column: string;
            type: "numberObject";
            operator: "=" | ">" | "<" | ">=" | "<=";
            key: string;
            value: number;
          }>;

          // Convert to NumericKeyValueFilterEntry array
          const activeFilters: NumericKeyValueFilterEntry[] =
            numericFilters.map((f) => ({
              key: f.key,
              operator: f.operator,
              value: f.value,
            }));

          const isActive = activeFilters.length > 0;

          // Get available keys from options (should be array of score names)
          const availableKeys = options[facet.column];
          const keyOptions =
            facet.keyOptions ??
            (Array.isArray(availableKeys) ? availableKeys : undefined);

          return {
            type: "numericKeyValue",
            column: facet.column,
            label: facet.label,
            shortKey: getShortKey(facet.column),
            value: activeFilters,
            keyOptions,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            onChange: (filters: NumericKeyValueFilterEntry[]) => {
              // Remove all existing numberObject filters for this column
              const withoutNumeric = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "numberObject"),
              );

              // Only add filters that have key and valid numeric value
              const validFilters = filters.filter(
                (entry) => entry.key && entry.value !== "",
              );

              const newFilters: FilterState = [
                ...withoutNumeric,
                ...validFilters.map((entry) => ({
                  column: facet.column,
                  type: "numberObject" as const,
                  operator: entry.operator,
                  key: entry.key,
                  value: entry.value as number,
                })),
              ];

              setFilterState(newFilters);
            },
            onReset: () => {
              // Remove all numberObject filters for this column
              const newFilters = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "numberObject"),
              );
              setFilterState(newFilters);
            },
          };
        }

        // Handle stringKeyValue filters
        if (facet.type === "stringKeyValue") {
          // Extract all stringObject filters for this column from filterState
          const stringFilters = filterState.filter(
            (f) => f.column === facet.column && f.type === "stringObject",
          ) as Array<{
            column: string;
            type: "stringObject";
            operator: "=" | "contains" | "does not contain";
            key: string;
            value: string;
          }>;

          // Convert to StringKeyValueFilterEntry array
          const activeFilters: StringKeyValueFilterEntry[] = stringFilters.map(
            (f) => ({
              key: f.key,
              operator: f.operator,
              value: f.value,
            }),
          );

          const isActive = activeFilters.length > 0;

          // Get available keys from options
          const availableKeys = options[facet.column];
          const keyOptions =
            facet.keyOptions ??
            (Array.isArray(availableKeys) ? availableKeys : undefined);

          return {
            type: "stringKeyValue",
            column: facet.column,
            label: facet.label,
            shortKey: getShortKey(facet.column),
            value: activeFilters,
            keyOptions,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            onChange: (filters: StringKeyValueFilterEntry[]) => {
              // Remove all existing stringObject filters for this column
              const withoutString = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "stringObject"),
              );

              // Only add filters that have key and non-empty value
              const validFilters = filters.filter(
                (entry) => entry.key && entry.value.trim() !== "",
              );

              const newFilters: FilterState = [
                ...withoutString,
                ...validFilters.map((entry) => ({
                  column: facet.column,
                  type: "stringObject" as const,
                  operator: entry.operator,
                  key: entry.key,
                  value: entry.value,
                })),
              ];

              setFilterState(newFilters);
            },
            onReset: () => {
              // Remove all stringObject filters for this column
              const newFilters = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "stringObject"),
              );
              setFilterState(newFilters);
            },
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
        const availableValuesRaw = options[facet.column] ?? [];
        // For nested structures, default to empty array (shouldn't happen for categorical)
        const availableValues = Array.isArray(availableValuesRaw)
          ? availableValuesRaw
          : [];
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
    setFilterState,
  ]);

  return {
    filterState,
    setFilterState,
    updateFilter,
    updateFilterOnly,
    clearAll,
    isFiltered: filterState.length > 0,
    filters,
    expanded: expandedState,
    onExpandedChange,
  };
}
