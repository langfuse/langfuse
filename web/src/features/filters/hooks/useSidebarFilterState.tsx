import type React from "react";
import { useCallback, useMemo, useEffect, useRef } from "react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import {
  type FilterState,
  singleFilter,
  type SingleValueOption,
  type ColumnDefinition,
} from "@langfuse/shared";
import {
  computeSelectedValues,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
} from "../lib/filter-query-encoding";
import { normalizeFilterColumnNames } from "../lib/filter-transform";
import useSessionStorage from "@/src/components/useSessionStorage";
import useLocalStorage from "@/src/components/useLocalStorage";
import type { FilterConfig } from "../lib/filter-config";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";

/**
 * Decodes filters from URL query string and normalizes display names to column IDs.
 * This prevents duplicates when old URLs use display names and new filters use column IDs.
 *
 * @param filtersQuery - Encoded filter string from URL
 * @param columnDefinitions - Column definitions for validation and normalization
 * @returns Normalized and validated FilterState
 */
export function decodeAndNormalizeFilters(
  filtersQuery: string,
  columnDefinitions: ColumnDefinition[],
): FilterState {
  try {
    const filters = decodeFiltersGeneric(filtersQuery);

    // Normalize display names to column IDs immediately after decoding
    // This prevents duplicates when old URLs use display names (e.g., "Environment")
    // and user adds new filters with column IDs (e.g., "environment")
    const normalized = normalizeFilterColumnNames(filters, columnDefinitions);

    // Validate normalized filters
    const result: FilterState = [];
    for (const filter of normalized) {
      const validationResult = singleFilter.safeParse(filter);
      if (validationResult.success) {
        result.push(validationResult.data);
      } else {
        console.warn(`Invalid filter skipped:`, filter, validationResult.error);
      }
    }
    return result;
  } catch (error) {
    console.error("Error decoding filters:", error);
    return [];
  }
}

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
  tooltip?: string;
  loading: boolean;
  expanded: boolean;
  isActive: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  onReset: () => void;
}

/**
 * Represents one text filter entry (contains/does not contain)
 * Used for free-text filtering that's mutually exclusive with checkbox selection
 */
export type TextFilterEntry = {
  operator: "contains" | "does not contain";
  value: string;
};

export interface CategoricalUIFilter extends BaseUIFilter {
  type: "categorical";
  value: string[];
  options: string[];
  counts: Map<string, number>;
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  /** Optional function to render an icon next to filter option labels */
  renderIcon?: (value: string) => React.ReactNode;
  /**
   * Current operator for arrayOptions columns (tags, labels, etc.)
   * - "any of": OR logic - match if item has ANY selected value
   * - "all of": AND logic - match if item has ALL selected values
   * undefined for non-arrayOptions columns
   */
  operator?: "any of" | "all of";
  /**
   * Callback to change the operator. Only provided for arrayOptions columns.
   * When called, updates the filter to use the specified operator.
   */
  onOperatorChange?: (operator: "any of" | "all of") => void;
  /**
   * Active text filters (contains/does not contain) for this column
   * Mutually exclusive with checkbox selections
   */
  textFilters?: TextFilterEntry[];
  // Add a new text filter. Automatically clears checkbox selections.
  onTextFilterAdd?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
  // Remove a text filter by operator and value
  onTextFilterRemove?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
  // True if any text filters are active for this column
  hasTextFilters?: boolean;
  // True if any checkboxes are selected (excluding "all selected" state)
  hasCheckboxSelections?: boolean;
}

export interface NumericUIFilter extends BaseUIFilter {
  type: "numeric";
  value: [number, number];
  min: number;
  max: number;
  onChange: (value: [number, number]) => void;
  unit?: string;
  step?: number;
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

export type PositionInTraceMode =
  | "root"
  | "last"
  | "nthFromStart"
  | "nthFromEnd";

export interface PositionInTraceUIFilter extends BaseUIFilter {
  type: "positionInTrace";
  mode: PositionInTraceMode | null;
  nthValue: number;
  onModeChange: (mode: PositionInTraceMode | null) => void;
  onNthValueChange: (value: number) => void;
}

export type UIFilter =
  | CategoricalUIFilter
  | NumericUIFilter
  | StringUIFilter
  | KeyValueUIFilter
  | NumericKeyValueUIFilter
  | StringKeyValueUIFilter
  | PositionInTraceUIFilter;

const EMPTY_MAP: Map<string, number> = new Map();
type MutualExclusionContext = {
  facetsByColumn: Map<string, FilterConfig["facets"][number]>;
};

function buildMutualExclusionContext(
  config: FilterConfig,
): MutualExclusionContext {
  return {
    facetsByColumn: new Map(
      config.facets.map((facet) => [facet.column, facet]),
    ),
  };
}

function areMutuallyExclusive(
  firstColumn: string,
  secondColumn: string,
  context: MutualExclusionContext,
): boolean {
  if (firstColumn === secondColumn) return false;

  const firstFacet = context.facetsByColumn.get(firstColumn);
  const secondFacet = context.facetsByColumn.get(secondColumn);

  if (!firstFacet || !secondFacet) return false;

  const firstBlocksSecond =
    firstFacet.mutuallyExclusiveWith?.includes(secondColumn) ?? false;
  const secondBlocksFirst =
    secondFacet.mutuallyExclusiveWith?.includes(firstColumn) ?? false;

  return firstBlocksSecond || secondBlocksFirst;
}

function reconcileMutuallyExclusiveFilters(
  filters: FilterState,
  context: MutualExclusionContext,
): FilterState {
  // Last added filter wins: when a conflicting filter is added, drop the older side.
  let reconciled: FilterState = [];

  for (const filter of filters) {
    reconciled = reconciled.filter(
      (existing) =>
        !areMutuallyExclusive(existing.column, filter.column, context),
    );
    reconciled.push(filter);
  }

  return reconciled;
}

// extract values and counts from options array
// for both string[] and SingleValueOption[]
function processOptions(options: (string | SingleValueOption)[]): {
  values: string[];
  counts: Map<string, number>;
} {
  const values: string[] = [];
  const counts = new Map<string, number>();

  for (const opt of options) {
    if (typeof opt === "string") {
      values.push(opt);
    } else if (typeof opt === "object" && "value" in opt) {
      values.push(opt.value);
      if (opt.count !== undefined) {
        counts.set(opt.value, opt.count);
      }
    }
  }

  return { values, counts: counts.size > 0 ? counts : EMPTY_MAP };
}

type UpdateFilter = (
  column: string,
  values: string[],
  operator?: "any of" | "none of" | "all of",
) => void;

/**
 * Pure function that determines the operator and values for checkbox-based
 * filter interactions. Extracted for testability.
 *
 * For arrayOptions (e.g., tags), "none of" inversion is NOT semantically
 * equivalent because a single trace can have multiple tags. For example,
 * a trace with tags [tag-1, tag-3] matches "any of [tag-1, tag-2]" but does NOT match
 * "none of [tag-3, tag-4, tag-5]" (because it contains tag-3). So we always use positive
 * matching ("any of" / "all of") for array columns.
 *
 * For stringOptions (e.g., environment), each row has a single value,
 * so "none of [deselected]" is semantically equivalent to "any of [selected]".
 *
 * @param params - Filter context including column type, existing filter, selected and available values
 * @returns Object with finalOperator and finalValues to apply
 */
export function resolveCheckboxOperator(params: {
  colType: string | undefined;
  existingFilter: FilterState[number] | undefined;
  values: string[];
  availableValues: string[];
}): { finalOperator: "any of" | "none of" | "all of"; finalValues: string[] } {
  const { colType, existingFilter, values, availableValues } = params;

  if (colType === "arrayOptions") {
    // For array columns, always use positive matching.
    if (
      existingFilter?.operator === "all of" &&
      existingFilter.type === "arrayOptions"
    ) {
      return { finalOperator: "all of", finalValues: values };
    }
    return { finalOperator: "any of", finalValues: values };
  }

  // For single-valued columns (stringOptions), "none of" inversion is safe
  if (!existingFilter) {
    const deselected = availableValues.filter((v) => !values.includes(v));
    return { finalOperator: "none of", finalValues: deselected };
  }
  if (
    existingFilter.operator === "none of" &&
    existingFilter.type === "stringOptions"
  ) {
    const deselected = availableValues.filter((v) => !values.includes(v));
    return { finalOperator: "none of", finalValues: deselected };
  }
  return { finalOperator: "any of", finalValues: values };
}

export function useSidebarFilterState(
  config: FilterConfig,
  options: Record<
    string,
    (string | SingleValueOption)[] | Record<string, string[]> | undefined
  >,
  projectId?: string,
  loading?: boolean,
  /**
   * If true, prevents filter state from being persisted to/read from URL query params.
   * Use this for embedded tables (e.g., preview tables in forms) to avoid polluting
   * the parent page's URL with filters that don't apply to the parent context.
   */
  disableUrlPersistence?: boolean,
  /**
   * Default filters to apply on initial page load (when no URL filters are present).
   * These apply every time the component mounts, but respect user's manual filter changes.
   * If a user clears all filters, defaults won't reapply until the component remounts (new page visit).
   */
  defaultFilters?: FilterState,
) {
  const peekContext = usePeekTableState();

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

  const mutualExclusionContext = useMemo(
    () => buildMutualExclusionContext(config),
    [config],
  );

  // TODO: Canonicalize URL when reconciliation drops mutually exclusive filters.
  // Why: links can still contain mutually exclusive filters while the effective in-memory state has one side removed,
  // which makes shared URLs and debugging confusing because URL no longer matches the applied filter state.
  const urlFilterState: FilterState = useMemo(() => {
    // If URL persistence is disabled, return empty filter state
    if (disableUrlPersistence) return [];
    return reconcileMutuallyExclusiveFilters(
      decodeAndNormalizeFilters(filtersQuery, config.columnDefinitions),
      mutualExclusionContext,
    );
  }, [
    filtersQuery,
    config.columnDefinitions,
    disableUrlPersistence,
    mutualExclusionContext,
  ]);

  const rawFilterState: FilterState = peekContext
    ? peekContext.tableState.filters
    : urlFilterState;

  const filterState: FilterState = useMemo(
    () =>
      reconcileMutuallyExclusiveFilters(rawFilterState, mutualExclusionContext),
    [rawFilterState, mutualExclusionContext],
  );

  // Track if user has manually interacted with filters
  // This prevents default filters from overriding user's explicit "clear all" action
  const userHasInteractedRef = useRef(false);

  const setFilterState = useCallback(
    (newFilters: FilterState) => {
      // Keep mutual exclusion reconciliation canonicalized in one place.
      // Any direct writes to peekContext.tableState.filters outside this hook can bypass this guard.
      const reconciledFilters = reconcileMutuallyExclusiveFilters(
        newFilters,
        mutualExclusionContext,
      );

      if (peekContext) {
        peekContext.setTableState({
          ...peekContext.tableState,
          filters: reconciledFilters,
        });
        return;
      }

      // Don't modify URL if persistence is disabled
      if (disableUrlPersistence) return;

      // Mark that user has manually interacted with filters
      // Exception: Don't mark as interacted if this is the initial default filter application
      if (userHasInteractedRef.current || reconciledFilters.length > 0) {
        userHasInteractedRef.current = true;
      }

      const encoded = encodeFiltersGeneric(reconciledFilters);
      setFiltersQuery(encoded || null);
    },
    [
      setFiltersQuery,
      disableUrlPersistence,
      peekContext,
      mutualExclusionContext,
    ],
  );

  // track if defaults have been applied before, versioned to support future changes
  // per project tracking because people want a default experience in a new project
  const storageKey = projectId
    ? `${config.tableName}-${projectId}-env-defaults-v1`
    : `${config.tableName}-env-defaults-v1`;
  const [defaultsApplied, setDefaultsApplied] = useLocalStorage<boolean>(
    storageKey,
    false,
  );

  // Apply default filters when no URL filters are present
  useEffect(() => {
    // Skip auto-applying defaults for embedded tables
    if (disableUrlPersistence) return;

    // If there are already filters in URL, don't apply defaults
    if (filterState.length > 0) return;

    // If user has manually interacted with filters (e.g., cleared them), respect their choice
    // This prevents defaults from reapplying when user clears filters in the same session
    if (userHasInteractedRef.current) return;

    let filtersToApply: FilterState = [];

    // Priority 1: Apply custom default filters if provided
    if (defaultFilters && defaultFilters.length > 0) {
      filtersToApply = defaultFilters;
    }
    // Priority 2: Fallback to legacy environment filter (one-time with localStorage)
    else if (!defaultsApplied) {
      const environmentFacet = config.facets.find(
        (f) => f.column === "environment" && f.type === "categorical",
      );

      if (environmentFacet) {
        const environmentOptions = options["environment"];
        if (
          Array.isArray(environmentOptions) &&
          environmentOptions.length > 0
        ) {
          const environments = environmentOptions.map((opt) =>
            typeof opt === "string" ? opt : opt.value,
          );

          const langfuseEnvironments = environments.filter((env) =>
            env.startsWith("langfuse-"),
          );

          if (langfuseEnvironments.length > 0) {
            filtersToApply = [
              {
                column: "environment",
                type: "stringOptions",
                operator: "none of",
                value: langfuseEnvironments,
              },
            ];
          }
        }
      }
    }

    // Apply filters if any were determined
    if (filtersToApply.length > 0) {
      setFilterState(filtersToApply);
      // Only mark as applied for legacy environment filter (not for custom defaultFilters)
      if (!defaultFilters || defaultFilters.length === 0) {
        setDefaultsApplied(true);
      }
    }
  }, [
    filterState.length,
    defaultsApplied,
    config.facets,
    options,
    disableUrlPersistence,
    setFilterState,
    setDefaultsApplied,
    defaultFilters,
  ]);

  const clearAll = () => {
    setFilterState([]);
  };

  // Generic apply selection logic
  const applySelection = useCallback(
    (
      current: FilterState,
      column: string,
      values: string[],
      operator?: "any of" | "none of" | "all of",
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
        const invert = facet.invertValue ?? false;

        if (values.length === 0 || values.length === 2) return other;
        if (values.includes(trueLabel)) {
          return [
            ...other,
            {
              column,
              type: "boolean" as const,
              operator: "=" as const,
              value: invert ? false : true,
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
              value: invert ? true : false,
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

      const availableValues = availableValuesRaw.map((opt) =>
        typeof opt === "string" ? opt : opt.value,
      );

      // Determine operator and values based on context
      let finalOperator: "any of" | "none of" | "all of";
      let finalValues: string[];

      if (operator !== undefined) {
        // Explicit operator provided (e.g., from "Only" button or operator toggle) - use as-is
        finalOperator = operator;
        finalValues = values;
      } else {
        // If all items selected or none selected, remove filter
        // (only for implicit/checkbox-based selection, not when operator is explicitly set)
        if (
          values.length === 0 ||
          (values.length === availableValues.length &&
            availableValues.every((v) => values.includes(v)))
        ) {
          return other;
        }
        // Checkbox interaction - smart operator selection
        const existingFilter = current.find((f) => f.column === column);
        ({ finalOperator, finalValues } = resolveCheckboxOperator({
          colType,
          existingFilter,
          values,
          availableValues,
        }));
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

      // stringOptions only supports "any of" | "none of", not "all of"
      // finalOperator can be "all of" because UpdateFilter type signature allows it,
      // but this shouldn't happen. UI only shows operator toggle for arrayOptions,
      // which cannot be set to "all of". We just prevent a TS build error here.
      const stringOperator: "any of" | "none of" =
        finalOperator === "all of" ? "any of" : finalOperator;

      return [
        ...other,
        {
          column,
          type: "stringOptions" as const,
          operator: stringOperator,
          value: finalValues,
        },
      ];
    },
    [config, options],
  );

  const updateFilter: UpdateFilter = useCallback(
    (column, values, operator?: "any of" | "none of" | "all of") => {
      // Remove text filters for this column (they're mutually exclusive with checkboxes)
      const withoutTextFilters = filterState.filter(
        (f) =>
          !(
            f.column === column &&
            f.type === "string" &&
            (f.operator === "contains" || f.operator === "does not contain")
          ),
      );

      const next = applySelection(withoutTextFilters, column, values, operator);
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

  const updateOperator = useCallback(
    (column: string, newOperator: "any of" | "all of") => {
      // Find the existing filter for this column
      const existingFilter = filterState.find((f) => f.column === column);
      if (!existingFilter) {
        // Create a filter with the operator and empty values
        // important so users set the operator preference before selecting values,
        // in case for ALL on TAGS filter
        updateFilter(column, [], newOperator);
        return;
      }

      // Only works for arrayOptions and stringOptions filters
      if (
        existingFilter.type !== "arrayOptions" &&
        existingFilter.type !== "stringOptions"
      ) {
        return;
      }

      // Get the current selected values
      // For "none of", we need to compute the actual selected values
      const availableValuesRaw = options[column];
      const availableValues = Array.isArray(availableValuesRaw)
        ? availableValuesRaw.map((opt) =>
            typeof opt === "string" ? opt : opt.value,
          )
        : [];

      let currentValues: string[];
      if (existingFilter.operator === "none of") {
        // Convert "none of [excluded]" to selected values
        const excluded = new Set(existingFilter.value);
        currentValues = availableValues.filter((v) => !excluded.has(v));
      } else {
        currentValues = existingFilter.value;
      }

      // Update the filter with the new operator
      updateFilter(column, currentValues, newOperator);
    },
    [filterState, updateFilter, options],
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

  // Text filter management for categorical filters
  // Mutually exclusive with checkbox selections
  const addTextFilter = useCallback(
    (
      column: string,
      operator: "contains" | "does not contain",
      value: string,
    ) => {
      if (!value.trim()) {
        return;
      }

      // Remove all checkbox filters (stringOptions/arrayOptions) for this column
      const withoutCheckboxFilters = filterState.filter(
        (f) =>
          !(
            f.column === column &&
            (f.type === "stringOptions" || f.type === "arrayOptions")
          ),
      );

      // Add the new text filter
      const newFilter: FilterState[number] = {
        column,
        type: "string",
        operator,
        value: value.trim(),
      };

      const next: FilterState = [...withoutCheckboxFilters, newFilter];
      setFilterState(next);
    },
    [filterState, setFilterState],
  );

  const removeTextFilter = useCallback(
    (
      column: string,
      operator: "contains" | "does not contain",
      value: string,
    ) => {
      const newFilters = filterState.filter(
        (f) =>
          !(
            f.column === column &&
            f.type === "string" &&
            f.operator === operator &&
            f.value === value
          ),
      );

      setFilterState(newFilters);
    },
    [filterState, setFilterState],
  );

  const filters: UIFilter[] = useMemo((): UIFilter[] => {
    const filterByColumn = new Map(filterState.map((f) => [f.column, f]));
    const expandedSet = new Set(expandedState);
    const activeFilterColumns = new Set(filterState.map((f) => f.column));

    // Helper to determine if a filter should show loading state
    // Only filters that depend on options from the query should show loading
    const shouldShowLoading = (facetColumn: string): boolean => {
      if (!loading) return false;
      // Only show loading if the filter depends on options and options are not yet available
      // Filters that use options: categorical, keyValue, numericKeyValue, stringKeyValue
      // Filters that don't use options: numeric (uses facet.min/max), string (static), boolean (static)
      return options[facetColumn] === undefined;
    };

    const getFacetDisabledState = (
      facet: FilterConfig["facets"][number],
      isActive: boolean,
    ): { isDisabled: boolean; reason?: string } => {
      const staticDisabled = facet.isDisabled ?? false;

      if (staticDisabled) {
        return {
          isDisabled: true,
          reason: facet.disabledReason ?? "This filter is currently disabled.",
        };
      }

      // Keep currently active facets interactive so users can adjust or clear.
      if (!isActive) {
        for (const activeColumn of activeFilterColumns) {
          if (
            areMutuallyExclusive(
              facet.column,
              activeColumn,
              mutualExclusionContext,
            )
          ) {
            const blockingLabel =
              mutualExclusionContext.facetsByColumn.get(activeColumn)?.label ??
              activeColumn;
            return {
              isDisabled: true,
              reason: `Disabled because "${facet.label}" cannot be used with "${blockingLabel}".`,
            };
          }
        }
      }

      return { isDisabled: false };
    };

    return config.facets
      .map((facet): UIFilter | null => {
        if (facet.type === "positionInTrace") {
          const existing = filterState.find(
            (f) => f.column === facet.column && f.type === "positionInTrace",
          );
          const currentMode: PositionInTraceMode | null =
            existing && "key" in existing
              ? (existing.key as PositionInTraceMode)
              : null;
          const currentNthValue =
            existing &&
            "value" in existing &&
            typeof existing.value === "number"
              ? existing.value
              : 1;
          const isActive = currentMode !== null;
          const disableState = getFacetDisabledState(facet, isActive);

          return {
            type: "positionInTrace",
            column: facet.column,
            label: facet.label,
            mode: currentMode,
            nthValue: currentNthValue,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
            onModeChange: (mode: PositionInTraceMode | null) => {
              const withoutPosition = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "positionInTrace"),
              );
              if (mode === null) {
                setFilterState(withoutPosition);
              } else {
                const needsValue =
                  mode === "nthFromStart" || mode === "nthFromEnd";
                setFilterState([
                  ...withoutPosition,
                  {
                    column: facet.column,
                    type: "positionInTrace" as const,
                    operator: "=" as const,
                    key: mode,
                    value: needsValue ? currentNthValue : undefined,
                  },
                ]);
              }
            },
            onNthValueChange: (value: number) => {
              const withoutPosition = filterState.filter(
                (f) =>
                  !(f.column === facet.column && f.type === "positionInTrace"),
              );
              const mode = currentMode ?? "nthFromStart";
              setFilterState([
                ...withoutPosition,
                {
                  column: facet.column,
                  type: "positionInTrace" as const,
                  operator: "=" as const,
                  key: mode,
                  value: Math.max(1, value),
                },
              ]);
            },
            onReset: () => {
              setFilterState(
                filterState.filter(
                  (f) =>
                    !(
                      f.column === facet.column && f.type === "positionInTrace"
                    ),
                ),
              );
            },
          };
        }

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
          const disableState = getFacetDisabledState(facet, isActive);
          return {
            type: "numeric",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,

            value: currentRange,
            min: facet.min,
            max: facet.max,
            unit: facet.unit,
            step: facet.step,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
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

          const disableState = getFacetDisabledState(facet, isActive);
          return {
            type: "string",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,

            value: currentValue,
            loading: false,
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
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
          const disableState = getFacetDisabledState(facet, isActive);

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
            tooltip: facet.tooltip,

            value: activeFilters,
            keyOptions,
            availableValues:
              typeof availableValues === "object" &&
              !Array.isArray(availableValues)
                ? (availableValues as Record<string, string[]>)
                : ({} as Record<string, string[]>),
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
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
          const disableState = getFacetDisabledState(facet, isActive);

          // Get available keys from options (should be array of score names)
          const availableKeys = options[facet.column];
          const keyOptions =
            facet.keyOptions ??
            (Array.isArray(availableKeys)
              ? availableKeys.map((opt) =>
                  typeof opt === "string" ? opt : opt.value,
                )
              : undefined);

          return {
            type: "numericKeyValue",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,

            value: activeFilters,
            keyOptions,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
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
          const disableState = getFacetDisabledState(facet, isActive);

          // Get available keys from options
          const availableKeys = options[facet.column];
          const keyOptions =
            facet.keyOptions ??
            (Array.isArray(availableKeys)
              ? availableKeys.map((opt) =>
                  typeof opt === "string" ? opt : opt.value,
                )
              : undefined);

          return {
            type: "stringKeyValue",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,

            value: activeFilters,
            keyOptions,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
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
          const invert = facet.invertValue ?? false;
          const availableOptions = [trueLabel, falseLabel];
          const filterEntry = filterByColumn.get(facet.column);

          let selectedOptions = availableOptions;
          if (filterEntry) {
            const boolValue = filterEntry.value as boolean;
            if (invert) {
              // Inverted: filter value=true means falseLabel selected, value=false means trueLabel selected
              selectedOptions = boolValue === true ? [falseLabel] : [trueLabel];
            } else {
              selectedOptions = boolValue === true ? [trueLabel] : [falseLabel];
            }
          }
          const isActive = selectedOptions.length === 1;
          const disableState = getFacetDisabledState(facet, isActive);

          // Build counts from options
          const rawOptions = options[facet.column];
          let counts: Map<string, number> = EMPTY_MAP;
          if (Array.isArray(rawOptions) && rawOptions.length > 0) {
            const { counts: processedCounts } = processOptions(rawOptions);
            if (processedCounts.size > 0) {
              counts = new Map<string, number>();
              if (invert) {
                // Inverted: trueLabel count comes from "false", falseLabel count comes from "true"
                const falseCount = processedCounts.get("false") ?? 0;
                const trueCount = processedCounts.get("true") ?? 0;
                if (falseCount > 0) counts.set(trueLabel, falseCount);
                if (trueCount > 0) counts.set(falseLabel, trueCount);
              } else {
                const trueCount = processedCounts.get("true") ?? 0;
                const falseCount = processedCounts.get("false") ?? 0;
                if (trueCount > 0) counts.set(trueLabel, trueCount);
                if (falseCount > 0) counts.set(falseLabel, falseCount);
              }
            }
          }

          return {
            type: "categorical",
            column: facet.column,
            label: facet.label,
            tooltip: facet.tooltip,

            value: selectedOptions,
            options: availableOptions,
            counts,
            loading: shouldShowLoading(facet.column),
            expanded: expandedSet.has(facet.column),
            isActive,
            isDisabled: disableState.isDisabled,
            disabledReason: disableState.reason,
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
        const availableValuesWithOptions = Array.isArray(availableValuesRaw)
          ? availableValuesRaw
          : [];

        // Extract counts and values to display along multi-select values
        const { values: availableValues, counts } = Array.isArray(
          availableValuesWithOptions,
        )
          ? processOptions(availableValuesWithOptions)
          : { values: [], counts: EMPTY_MAP };

        // Check if this column supports operator toggle
        // Only arrayOptions columns get the ANY/ALL toggle
        // - arrayOptions: multi-valued arrays (e.g., tags on a trace)
        // - stringOptions: single-valued strings (e.g., environment)
        const colDef = config.columnDefinitions.find(
          (c) => c.id === facet.column,
        );
        const isArrayOptions = colDef?.type === "arrayOptions";

        // Get the checkbox filter (stringOptions/arrayOptions) for this column
        const checkboxFilter = filterState.find(
          (f) =>
            f.column === facet.column &&
            (f.type === "stringOptions" || f.type === "arrayOptions"),
        );

        const selectedValues = computeSelectedValues(
          availableValues,
          checkboxFilter,
        );

        // Determine current operator for ANY/ALL toggle
        // When a user selects items in an arrayOptions filter, we expose a toggle
        // to switch between:
        // - "any of" (OR logic): match if item has ANY selected value
        // - "all of" (AND logic): match if item has ALL selected values
        // This operator is persisted in the filter state and URL
        let currentOperator: "any of" | "all of" | undefined;
        if (
          checkboxFilter &&
          (checkboxFilter.type === "arrayOptions" ||
            checkboxFilter.type === "stringOptions") &&
          (checkboxFilter.operator === "any of" ||
            checkboxFilter.operator === "all of")
        ) {
          currentOperator = checkboxFilter.operator;
        } else if (isArrayOptions && selectedValues.length > 0) {
          // Default to "any of" for arrayOptions when selections exist but no explicit operator
          currentOperator = "any of";
        } else {
          currentOperator = undefined;
        }

        // Extract text filters for this column (contains/does not contain)
        const textFilters: TextFilterEntry[] = filterState
          .filter(
            (f): f is Extract<typeof f, { type: "string" }> =>
              f.column === facet.column &&
              f.type === "string" &&
              (f.operator === "contains" || f.operator === "does not contain"),
          )
          .map((f) => ({
            operator: f.operator as "contains" | "does not contain",
            value: f.value,
          }));

        const hasTextFilters = textFilters.length > 0;
        const hasCheckboxSelections =
          selectedValues.length > 0 &&
          selectedValues.length !== availableValues.length;

        // isActive check: filter is active if we have text filters OR checkbox selections
        // Special case: "all of" with all values selected is still an active filter
        const isActive =
          hasTextFilters ||
          (currentOperator === "all of" &&
            selectedValues.length === availableValues.length) ||
          hasCheckboxSelections;
        const disableState = getFacetDisabledState(facet, isActive);

        return {
          type: "categorical",
          column: facet.column,
          label: facet.label,
          tooltip: facet.tooltip,

          value: selectedValues,
          options: availableValues,
          counts,
          loading: shouldShowLoading(facet.column),
          expanded: expandedSet.has(facet.column),
          isActive,
          isDisabled: disableState.isDisabled,
          disabledReason: disableState.reason,
          renderIcon:
            facet.type === "categorical" ? facet.renderIcon : undefined,
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
          onReset: () => {
            // Reset both checkboxes AND text filters
            const withoutAll = filterState.filter(
              (f) =>
                !(
                  f.column === facet.column &&
                  (f.type === "stringOptions" ||
                    f.type === "arrayOptions" ||
                    (f.type === "string" &&
                      (f.operator === "contains" ||
                        f.operator === "does not contain")))
                ),
            );
            setFilterState(withoutAll);
          },
          // Only add operator toggle for arrayOptions columns
          operator: isArrayOptions ? currentOperator : undefined,
          onOperatorChange: isArrayOptions
            ? (op: "any of" | "all of") => updateOperator(facet.column, op)
            : undefined,
          // Text filter support - ONLY for stringOptions, NOT arrayOptions or boolean
          textFilters: !isArrayOptions ? textFilters : undefined,
          onTextFilterAdd: !isArrayOptions
            ? (op, val) => addTextFilter(facet.column, op, val)
            : undefined,
          onTextFilterRemove: !isArrayOptions
            ? (op, val) => removeTextFilter(facet.column, op, val)
            : undefined,
          hasTextFilters: !isArrayOptions ? hasTextFilters : undefined,
          hasCheckboxSelections,
        };
      })
      .filter((f): f is UIFilter => f !== null);
  }, [
    config,
    options,
    loading,
    filterState,
    updateFilter,
    updateFilterOnly,
    updateOperator,
    updateNumericFilter,
    updateStringFilter,
    addTextFilter,
    removeTextFilter,
    expandedState,
    setFilterState,
    mutualExclusionContext,
  ]);

  return {
    filterState,
    setFilterState,
    updateFilter,
    updateFilterOnly,
    updateOperator,
    clearAll,
    isFiltered: filterState.length > 0,
    filters,
    expanded: expandedState,
    onExpandedChange,
  };
}
