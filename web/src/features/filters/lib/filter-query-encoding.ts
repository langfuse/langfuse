import { type FilterState, singleFilter } from "@langfuse/shared";
import { encodeDelimitedArray, decodeDelimitedArray } from "use-query-params";

// Generic helpers for reusable encoding/decoding across feature areas
export type ColumnToQueryKeyMap = Record<string, string>;
export type GenericFilterOptions = Record<
  string,
  string[] | Record<string, string[]>
>;

export const createShortKeyGetter =
  (columnToQueryKey: ColumnToQueryKeyMap) =>
  (column: string): string | null => {
    const key = columnToQueryKey[column];
    return key ?? null;
  };

// Note: short key getters are feature-specific; use createShortKeyGetter in feature modules

// Pure helper: compute UI-selected values from a filter entry and available values
export function computeSelectedValues(
  availableValues: string[],
  filterEntry: { operator?: string; value?: unknown } | undefined,
): string[] {
  if (!filterEntry) return availableValues;
  const values = (filterEntry.value as string[]) ?? [];
  if (filterEntry.operator === "none of") {
    const excluded = new Set(values);
    return availableValues.filter((v) => !excluded.has(v));
  }
  return values;
}

/**
 * Encodes FilterState to the legacy semicolon-delimited format
 * Format: columnId;type;key;operator;value
 * Multiple filters separated by commas
 * Array values joined with |
 */
export function encodeFiltersGeneric(
  filters: FilterState,
  columnToQueryKey: ColumnToQueryKeyMap,
  _options?: Partial<GenericFilterOptions>,
): string {
  return (
    encodeDelimitedArray(
      filters
        .map((f) => {
          const columnId = columnToQueryKey[f.column];

          if (!columnId) {
            return null;
          }

          // Determine the key field (for categoryOptions, numberObject, stringObject)
          const key =
            f.type === "numberObject" ||
            f.type === "stringObject" ||
            f.type === "categoryOptions"
              ? (f as any).key || ""
              : "";

          // Encode the value
          let encodedValue: string;
          if (f.type === "datetime") {
            encodedValue = encodeURIComponent(new Date(f.value).toISOString());
          } else if (
            f.type === "stringOptions" ||
            f.type === "arrayOptions" ||
            f.type === "categoryOptions"
          ) {
            encodedValue = encodeURIComponent((f.value as string[]).join("|"));
          } else {
            encodedValue = encodeURIComponent(String(f.value));
          }

          return `${columnId};${f.type};${key};${f.operator};${encodedValue}`;
        })
        .filter((s): s is string => s !== null),
      ",",
    ) || ""
  );
}

/**
 * Decodes the legacy semicolon-delimited format to FilterState
 * Format: columnId;type;key;operator;value
 */
export function decodeFiltersGeneric(
  query: string,
  columnToQueryKey: ColumnToQueryKeyMap,
  _options: Partial<GenericFilterOptions>,
  _getType?: (column: string) => any,
): FilterState {
  if (!query.trim()) return [];

  const decoded = decodeDelimitedArray(query, ",");
  if (!decoded) return [];

  const filters: FilterState = [];

  // Create reverse mapping from columnId to column name
  const idToColumn: Record<string, string> = {};
  for (const [columnName, columnId] of Object.entries(columnToQueryKey)) {
    idToColumn[columnId] = columnName;
  }

  for (const filterString of decoded) {
    if (!filterString) continue;

    const [columnId, type, key, operator, encodedValue] =
      filterString.split(";");

    if (!columnId || !type || !operator || encodedValue === undefined) {
      continue;
    }

    const column = idToColumn[columnId];
    if (!column) {
      continue;
    }

    const decodedValue = decodeURIComponent(encodedValue);

    // Parse value based on type
    let parsedValue: any;
    if (type === "datetime") {
      parsedValue = new Date(decodedValue);
    } else if (type === "number" || type === "numberObject") {
      parsedValue = Number(decodedValue);
    } else if (
      type === "stringOptions" ||
      type === "arrayOptions" ||
      type === "categoryOptions"
    ) {
      parsedValue = decodedValue.split("|");
    } else if (type === "boolean") {
      parsedValue = decodedValue === "true";
    } else {
      parsedValue = decodedValue;
    }

    // Build filter object
    const filter: any = {
      column,
      type,
      operator,
      value: parsedValue,
    };

    // Add key field for types that need it
    if (
      key &&
      (type === "categoryOptions" ||
        type === "numberObject" ||
        type === "stringObject")
    ) {
      filter.key = key;
    }

    // Validate with zod
    const parsed = singleFilter.safeParse(filter);
    if (parsed.success) {
      filters.push(parsed.data);
    } else {
      console.warn("Invalid filter skipped:", filter, parsed.error);
    }
  }

  return filters;
}
