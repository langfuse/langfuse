import type {
  ColumnDefinition,
  FilterState,
  SingleValueOption,
} from "@langfuse/shared";
import type { FilterConfig } from "./filter-config";

// Pure FilterState transitions behind the sidebar's facet interactions.
// No React: every function maps (context, current state, user input) to the
// next FilterState; useSidebarFilterState wires them to setFilterState and
// analytics. Keeping them here makes each user action a directly
// unit-testable function instead of a branch inside a 2000-line hook.

export type CheckboxOperator = "any of" | "all of" | "none of";
export type TextFilterOperator = "contains" | "does not contain";

/** Options as the sidebar hook receives them (per-column value lists, or
 *  nested key→values records for keyed facets). */
export type SidebarFilterOptions = Record<
  string,
  (string | SingleValueOption)[] | Record<string, string[]> | undefined
>;

export type SidebarFilterActionContext = {
  facets: FilterConfig["facets"];
  columnDefinitions: ColumnDefinition[];
  options: SidebarFilterOptions;
  /**
   * The managed environment column, set ONLY while the managed-environment
   * policy is active (hidden environments exist). Drives the explicit
   * enable-all-environments override in applySelection.
   */
  managedEnvironmentColumn?: string;
};

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

export type BooleanKeyValueFilterEntry = {
  key: string;
  operator: "=" | "<>";
  value: boolean | "";
};

// Represents one active string filter row in the string key-value facet UI
// Example: key="environment", operator="=", value="production"
export type StringKeyValueFilterEntry = {
  key: string;
  operator: "=" | "contains" | "does not contain";
  value: string;
};

const toValueList = (options: SidebarFilterOptions[string]): string[] | null =>
  Array.isArray(options)
    ? options.map((opt) => (typeof opt === "string" ? opt : opt.value))
    : null;

/**
 * Pure function that determines the operator and values for checkbox-based
 * filter interactions.
 *
 * Checkboxes always show the KEPT set — "no filter" renders every option
 * checked (implicit all). Unchecking from that state therefore expresses an
 * exclusion, and the deselected values persist as `none of [deselected]`
 * (LFE-10717). Materializing the complement (`any of [remaining]`) instead is
 * wrong twice over for multi-valued columns (arrayOptions): a row carrying an
 * excluded value alongside a still-checked one keeps matching (a session with
 * users [X, Y] matches "any of [everyone-but-X]" via Y), and the complement is
 * O(option-count) — at ~1000 user IDs it blows the URL budget (HTTP 431).
 *
 * An EXPLICIT positive selection is never inverted (a trace with tags
 * [tag-1, tag-3] matches "any of [tag-1, tag-2]" but not
 * "none of [tag-3, tag-4, tag-5]"): once an "any of" filter exists, checkbox
 * changes keep it positive, and "all of" is likewise preserved. While a
 * "none of" filter is active, the checked set is the complement of the stored
 * exclusions, so interactions re-derive the exclusions from what is unchecked
 * — carrying over exclusions that fell out of the (top-N-capped, time-scoped)
 * option list, which cannot have been re-checked while invisible.
 *
 * stringOptions (e.g., environment) behave the same way; each row has a
 * single value there, so "none of [deselected]" is exactly equivalent to
 * "any of [selected]".
 *
 * @param params - Filter context including column type, existing filter, selected and available values
 * @returns Object with finalOperator and finalValues to apply
 */
export function resolveCheckboxOperator(params: {
  colType: string | undefined;
  existingFilter: FilterState[number] | undefined;
  values: string[];
  availableValues: string[];
}): { finalOperator: CheckboxOperator; finalValues: string[] } {
  const { colType, existingFilter, values, availableValues } = params;

  if (colType === "arrayOptions") {
    if (
      existingFilter?.operator === "all of" &&
      existingFilter.type === "arrayOptions"
    ) {
      return { finalOperator: "all of", finalValues: values };
    }
    if (
      existingFilter?.operator === "none of" &&
      existingFilter.type === "arrayOptions"
    ) {
      const checked = new Set(values);
      const availableSet = new Set(availableValues);
      const carriedExclusions = existingFilter.value.filter(
        (v) => !availableSet.has(v),
      );
      const deselected = availableValues.filter((v) => !checked.has(v));
      return {
        finalOperator: "none of",
        finalValues: [...carriedExclusions, ...deselected],
      };
    }
    if (!existingFilter) {
      const checked = new Set(values);
      const deselected = availableValues.filter((v) => !checked.has(v));
      return { finalOperator: "none of", finalValues: deselected };
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
    // Same carry-over as the arrayOptions branch above: exclusions outside
    // the current option list are invisible and cannot have been re-checked.
    const checked = new Set(values);
    const availableSet = new Set(availableValues);
    const carriedExclusions = existingFilter.value.filter(
      (v) => !availableSet.has(v),
    );
    const deselected = availableValues.filter((v) => !checked.has(v));
    return {
      finalOperator: "none of",
      finalValues: [...carriedExclusions, ...deselected],
    };
  }
  return { finalOperator: "any of", finalValues: values };
}

/**
 * Applies a checkbox/boolean facet selection to the state. Returns `current`
 * unchanged when the column is unknown or its options are not enumerable.
 */
export function applySelection(
  ctx: SidebarFilterActionContext,
  current: FilterState,
  column: string,
  values: string[],
  operator?: CheckboxOperator,
): FilterState {
  const other = current.filter((f) => f.column !== column);

  const facet = ctx.facets.find((f) => f.column === column);
  if (!facet) return current;

  const colDef = ctx.columnDefinitions.find(
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
          value: !invert,
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
          value: !!invert,
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
  if (!(column in ctx.options)) return current;
  const availableValues = toValueList(ctx.options[column]);

  // For nested structures (keyValue filters), skip this logic
  if (availableValues === null) {
    return current;
  }

  // Determine operator and values based on context
  let finalOperator: CheckboxOperator;
  let finalValues: string[];
  const existingFilter = current.find((f) => f.column === column);
  const isManagedEnvironmentColumn = column === ctx.managedEnvironmentColumn;
  // For an active "none of" filter, "all checked" is not the same as
  // "no filter": exclusions outside the current option list may still be
  // live. Skip the all-selected removal shortcut and let
  // resolveCheckboxOperator re-derive the exclusion set (an emptied set is
  // removed below). For arrayOptions this also covers "none checked",
  // which means exclude-everything rather than reset; stringOptions keeps
  // its long-standing uncheck-everything-resets behavior. The managed
  // environment column is exempt: its all-selected shortcut persists the
  // explicit enable-all-environments override, and its hidden
  // environments are always listed, so there is nothing to carry.
  const preserveNoneOfOperator =
    (colType === "arrayOptions" &&
      existingFilter?.type === "arrayOptions" &&
      existingFilter.operator === "none of") ||
    (colType !== "arrayOptions" &&
      existingFilter?.type === "stringOptions" &&
      existingFilter.operator === "none of" &&
      values.length > 0 &&
      !isManagedEnvironmentColumn);

  if (operator !== undefined) {
    // Explicit operator provided (e.g., from "Only" button or operator toggle) - use as-is
    finalOperator = operator;
    finalValues = values;

    // An empty "none of" excludes nothing: since deselecting from the
    // all-checked default now enters NONE mode by itself, toggling NONE
    // without a selection is a no-op rather than a persisted vacuous
    // filter (which would light the badge while matching everything).
    if (finalOperator === "none of" && finalValues.length === 0) {
      return other;
    }
  } else {
    // If all items selected or none selected, remove filter
    // (only for implicit/checkbox-based selection, not when operator is explicitly set)
    if (
      !preserveNoneOfOperator &&
      (values.length === 0 ||
        (values.length === availableValues.length &&
          availableValues.every((v) => values.includes(v))))
    ) {
      // Keep explicit override when user intentionally enables all environments.
      if (isManagedEnvironmentColumn && values.length > 0) {
        return [
          ...other,
          {
            column,
            type: "stringOptions" as const,
            operator: "any of" as const,
            value: values,
          },
        ];
      }
      return other;
    }
    // Checkbox interaction - smart operator selection
    ({ finalOperator, finalValues } = resolveCheckboxOperator({
      colType,
      existingFilter,
      values,
      availableValues,
    }));

    // Re-checking the last excluded value empties the exclusion set:
    // return to the implicit-all default instead of persisting an empty
    // "none of" filter.
    if (finalOperator === "none of" && finalValues.length === 0) {
      return other;
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

  // stringOptions only supports "any of" | "none of", not "all of".
  // finalOperator can be "all of" because the caller's signature allows it,
  // but this shouldn't happen: the UI only shows the operator toggle for
  // arrayOptions. We just prevent a TS build error here.
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
}

/**
 * A checkbox interaction: text filters on the column are dropped first
 * (mutually exclusive with checkbox selections), then the selection applies.
 */
export function applyCheckboxSelection(
  ctx: SidebarFilterActionContext,
  current: FilterState,
  column: string,
  values: string[],
  operator?: CheckboxOperator,
): FilterState {
  const withoutTextFilters = current.filter(
    (f) =>
      !(
        f.column === column &&
        f.type === "string" &&
        (f.operator === "contains" || f.operator === "does not contain")
      ),
  );
  return applySelection(ctx, withoutTextFilters, column, values, operator);
}

/**
 * Derives the selection an "Only <value>" click should apply, or null when
 * the column cannot take one (unknown facet, non-enumerable options).
 *
 * "Only" is a positive selection: an active "none of" exclusion is replaced
 * rather than preserved — `none of [value]` would mean everything-EXCEPT-
 * value, the opposite of "only". "all of" is kept (all of one value = has
 * that value).
 */
export function buildOnlySelection(
  ctx: SidebarFilterActionContext,
  current: FilterState,
  column: string,
  value: string,
): { values: string[]; operator?: CheckboxOperator } | null {
  const facet = ctx.facets.find((f) => f.column === column);
  if (!facet) return null;

  // Boolean facets take the plain single-value path (no operator).
  if (facet.type === "boolean") {
    return { values: [value] };
  }

  if (!(column in ctx.options)) return null;
  // Only applies for array-type options (not nested objects)
  if (toValueList(ctx.options[column]) === null) return null;

  const columnType = ctx.columnDefinitions.find(
    (columnDefinition) => columnDefinition.id === column,
  )?.type;
  const existingFilter = current.find((f) => f.column === column);
  const operator: CheckboxOperator =
    columnType === "arrayOptions" &&
    existingFilter?.type === "arrayOptions" &&
    (existingFilter.operator === "any of" ||
      existingFilter.operator === "all of")
      ? existingFilter.operator
      : "any of";
  return { values: [value], operator };
}

/**
 * Derives the values an operator toggle (Any of / All of / None of) should
 * re-apply under the new operator, plus the previous operator for analytics.
 * Returns null when the column's existing filter cannot take an operator
 * change (non-checkbox filter types).
 */
export function deriveOperatorChange(
  ctx: SidebarFilterActionContext,
  current: FilterState,
  column: string,
): { values: string[]; fromOperator?: string } | null {
  const existingFilter = current.find((f) => f.column === column);
  if (!existingFilter) {
    // Without selected values there is no valid persisted filter yet.
    return { values: [], fromOperator: undefined };
  }

  // Only works for arrayOptions and stringOptions filters
  if (
    existingFilter.type !== "arrayOptions" &&
    existingFilter.type !== "stringOptions"
  ) {
    return null;
  }

  // For "none of", the SELECTED values are the complement of the stored
  // exclusions (arrayOptions stores the exclusions directly).
  const availableValues = toValueList(ctx.options[column]) ?? [];
  const currentValues =
    existingFilter.operator === "none of"
      ? existingFilter.type === "arrayOptions"
        ? existingFilter.value
        : availableValues.filter((v) => !new Set(existingFilter.value).has(v))
      : existingFilter.value;

  return { values: currentValues, fromOperator: existingFilter.operator };
}

/**
 * Applies a numeric range facet. `null` clears the column; a range always
 * persists both bounds (even at min/max) so the facet reads as active.
 */
export function applyNumericRange(
  current: FilterState,
  column: string,
  value: [number, number] | null,
): FilterState {
  const withoutNumeric = current.filter((f) => f.column !== column);
  if (value === null) return withoutNumeric;

  return [
    ...withoutNumeric,
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
}

/** Applies a plain string facet as a `contains` filter; blank clears it. */
export function applyStringContains(
  current: FilterState,
  column: string,
  value: string,
): FilterState {
  const withoutString = current.filter((f) => f.column !== column);
  if (value.trim() === "") return withoutString;
  return [
    ...withoutString,
    {
      column,
      type: "string" as const,
      operator: "contains" as const,
      value,
    },
  ];
}

/**
 * Adds a contains/does-not-contain text filter, dropping the column's
 * checkbox filters (mutually exclusive). Returns null for blank input
 * (caller no-ops).
 */
export function addTextFilterEntry(
  current: FilterState,
  column: string,
  operator: TextFilterOperator,
  value: string,
): FilterState | null {
  if (!value.trim()) return null;

  const withoutCheckboxFilters = current.filter(
    (f) =>
      !(
        f.column === column &&
        (f.type === "stringOptions" || f.type === "arrayOptions")
      ),
  );

  return [
    ...withoutCheckboxFilters,
    {
      column,
      type: "string",
      operator,
      value: value.trim(),
    },
  ];
}

/** Removes one text filter identified by operator + value. */
export function removeTextFilterEntry(
  current: FilterState,
  column: string,
  operator: TextFilterOperator,
  value: string,
): FilterState {
  return current.filter(
    (f) =>
      !(
        f.column === column &&
        f.type === "string" &&
        f.operator === operator &&
        f.value === value
      ),
  );
}

export type KeyedFilterKind =
  | "categoryOptions"
  | "numberObject"
  | "booleanObject"
  | "stringObject";

/** Removes every filter of the given type on the column (keyed facet reset). */
export function removeColumnFiltersOfType(
  current: FilterState,
  column: string,
  type: KeyedFilterKind,
): FilterState {
  return current.filter((f) => !(f.column === column && f.type === type));
}

/**
 * Replaces a keyed facet's rows (metadata, categorical/numeric/boolean
 * scores): drops the column's existing filters of that kind and appends the
 * COMPLETE rows — entries still missing a key or value are UI drafts and are
 * filtered out here, not persisted.
 */
export function applyKeyedFilterEntries(
  current: FilterState,
  column: string,
  update:
    | { kind: "categoryOptions"; entries: KeyValueFilterEntry[] }
    | { kind: "numberObject"; entries: NumericKeyValueFilterEntry[] }
    | { kind: "booleanObject"; entries: BooleanKeyValueFilterEntry[] }
    | { kind: "stringObject"; entries: StringKeyValueFilterEntry[] },
): FilterState {
  const without = removeColumnFiltersOfType(current, column, update.kind);

  switch (update.kind) {
    case "categoryOptions":
      return [
        ...without,
        ...update.entries
          .filter((entry) => entry.key && entry.value.length > 0)
          .map((entry) => ({
            column,
            type: "categoryOptions" as const,
            operator: entry.operator,
            key: entry.key,
            value: entry.value,
          })),
      ];
    case "numberObject":
      return [
        ...without,
        ...update.entries
          .filter((entry) => entry.key && entry.value !== "")
          .map((entry) => ({
            column,
            type: "numberObject" as const,
            operator: entry.operator,
            key: entry.key,
            value: entry.value as number,
          })),
      ];
    case "booleanObject":
      return [
        ...without,
        ...update.entries
          .filter((entry) => entry.key && entry.value !== "")
          .map((entry) => ({
            column,
            type: "booleanObject" as const,
            operator: entry.operator,
            key: entry.key,
            value: entry.value as boolean,
          })),
      ];
    case "stringObject":
      return [
        ...without,
        ...update.entries
          .filter((entry) => entry.key && entry.value.trim() !== "")
          .map((entry) => ({
            column,
            type: "stringObject" as const,
            operator: entry.operator,
            key: entry.key,
            value: entry.value,
          })),
      ];
  }
}

/**
 * Categorical facet reset: clears the column's checkbox filters AND its
 * text (contains / does not contain) filters in one step.
 */
export function clearCategoricalColumn(
  current: FilterState,
  column: string,
): FilterState {
  return current.filter(
    (f) =>
      !(
        f.column === column &&
        (f.type === "stringOptions" ||
          f.type === "arrayOptions" ||
          (f.type === "string" &&
            (f.operator === "contains" || f.operator === "does not contain")))
      ),
  );
}
