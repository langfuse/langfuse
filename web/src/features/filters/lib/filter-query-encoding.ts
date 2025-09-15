import { type FilterState } from "@langfuse/shared";

// Generic helpers for reusable encoding/decoding across feature areas
export type ColumnToQueryKeyMap = Record<string, string>;
export type GenericFilterOptions = Record<string, string[]>;

export const createShortKeyGetter =
  (columnToQueryKey: ColumnToQueryKeyMap) =>
  (column: string): string | null => {
    const key = columnToQueryKey[column];
    return key ?? null;
  };

// Note: short key getters are feature-specific; use createShortKeyGetter in feature modules

function parseQuotedValues(valueString: string): string[] {
  const values: string[] = [];
  let currentValue = "";
  let inQuotes = false;
  let i = 0;

  while (i < valueString.length) {
    const char = valueString[i];

    if (char === '"' && !inQuotes) {
      // Start of quoted value
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      // End of quoted value
      inQuotes = false;
    } else if (char === "," && !inQuotes) {
      // Comma outside quotes - end of value
      if (currentValue) {
        values.push(currentValue);
        currentValue = "";
      }
    } else {
      // Regular character
      currentValue += char;
    }

    i++;
  }

  // Add the last value
  if (currentValue) {
    values.push(currentValue);
  }

  return values;
}

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

export function encodeFiltersGeneric(
  filters: FilterState,
  columnToQueryKey: ColumnToQueryKeyMap,
  options?: Partial<Record<string, string[]>>,
): string {
  const serializedParts: string[] = [];

  for (const filter of filters) {
    // boolean filters: key:true|false
    if (filter.type === "boolean") {
      const queryKey = columnToQueryKey[filter.column];
      if (!queryKey) continue;
      serializedParts.push(`${queryKey}:${Boolean(filter.value)}`);
      continue;
    }

    // Only serialize string-like filters with supported operators
    if (
      (filter.type !== "stringOptions" && filter.type !== "arrayOptions") ||
      (filter.operator !== "any of" && filter.operator !== "none of")
    ) {
      continue;
    }

    const queryKey = columnToQueryKey[filter.column];
    if (!queryKey) continue;

    const availableValues = options?.[filter.column] ?? [];
    const availableSet = new Set(availableValues);

    const selectedValues = (filter.value as string[]) || [];
    const validValues = selectedValues.filter(
      (val) => availableSet.size === 0 || availableSet.has(val),
    );
    if (validValues.length === 0) continue;

    const serializedValues = validValues.map((val) => {
      const lowerVal = val.toLowerCase();
      return lowerVal.includes(":") ? `"${lowerVal}"` : lowerVal;
    });
    const valueString = serializedValues.join(",");
    const prefix = filter.operator === "none of" ? "-" : "";
    serializedParts.push(`${prefix}${queryKey}:${valueString}`);
  }

  return serializedParts.join(" ");
}

export function decodeFiltersGeneric(
  query: string,
  columnToQueryKey: ColumnToQueryKeyMap,
  options: Partial<Record<string, string[]>>,
  getType?: (column: string) => any,
): FilterState {
  if (!query.trim()) return [];

  const filters: FilterState = [];
  const parts = query.trim().split(/\s+/);

  for (const part of parts) {
    if (!part) continue;
    const isExclusive = part.startsWith("-");
    const cleanPart = isExclusive ? part.substring(1) : part;
    const colonIndex = cleanPart.indexOf(":");
    if (colonIndex === -1) continue;

    const key = cleanPart.substring(0, colonIndex);
    const valueString = cleanPart.substring(colonIndex + 1);

    // boolean
    const columnFromBoolean = Object.keys(columnToQueryKey).find(
      (c) => columnToQueryKey[c] === key,
    );
    if (!columnFromBoolean) continue;

    if (valueString === "true" || valueString === "false") {
      filters.push({
        column: columnFromBoolean,
        type: "boolean",
        operator: "=",
        value: valueString === "true",
      } as any);
      continue;
    }

    const availableValues = options[columnFromBoolean] ?? [];
    if (valueString === "") continue;

    const serializedValues = parseQuotedValues(valueString);
    const availableLowerCaseMap = new Map(
      availableValues.map((val) => [val.toLowerCase(), val]),
    );
    const filterValues = serializedValues
      .map((val) => availableLowerCaseMap.get(val))
      .filter((val): val is string => val !== undefined);
    if (filterValues.length === 0) continue;

    const filterType = getType?.(columnFromBoolean) ?? "stringOptions";
    filters.push({
      column: columnFromBoolean,
      type: filterType as any,
      operator: (isExclusive ? "none of" : "any of") as any,
      value: filterValues,
    } as any);
  }

  return filters;
}
