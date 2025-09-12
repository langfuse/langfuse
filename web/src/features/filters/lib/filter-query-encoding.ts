import { type FilterState } from "@langfuse/shared";

const FILTER_DEFINITIONS = {
  name: {
    label: "Name",
    queryKey: "name",
  },
  environment: {
    label: "Environment",
    queryKey: "env",
  },
  level: {
    label: "Level",
    queryKey: "level",
  },
} as const;

type FilterColumn = keyof typeof FILTER_DEFINITIONS;

export type FilterQueryOptions = {
  [K in FilterColumn]: string[];
};

export const getShortKey = (column: string): string | null => {
  const definition = FILTER_DEFINITIONS[column as FilterColumn];
  return definition?.queryKey || null;
};

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

export function encodeFilters(
  filters: FilterState,
  options: FilterQueryOptions,
): string {
  const serializedParts: string[] = [];

  for (const filter of filters) {
    // Only handle stringOptions filters
    if (filter.type !== "stringOptions" || filter.operator !== "any of") {
      continue;
    }

    const definition = FILTER_DEFINITIONS[filter.column as FilterColumn];
    if (!definition) continue;

    // Use the column name as options key
    if (!(filter.column in options)) continue;

    const availableValues = options[filter.column as FilterColumn];
    if (!availableValues) continue;

    // Always serialize filters (removed optimization that caused URL flickering)
    const selectedValues = filter.value as string[];
    const availableSet = new Set(availableValues);

    // Filter out invalid values and create serialized part
    const validValues = selectedValues.filter((val) => availableSet.has(val));

    // Skip if no valid values (shouldn't happen with new logic, but safety check)
    if (validValues.length === 0) continue;

    // Convert values to lower-case for serialization and quote if they contain colons
    const serializedValues = validValues.map((val) => {
      const lowerVal = val.toLowerCase();
      // Quote values that contain colons to avoid parsing issues
      return lowerVal.includes(":") ? `"${lowerVal}"` : lowerVal;
    });
    const valueString = serializedValues.join(",");
    serializedParts.push(`${definition.queryKey}:${valueString}`);
  }

  return serializedParts.join(" ");
}

export function decodeFilters(
  query: string,
  options: FilterQueryOptions,
): FilterState {
  if (!query.trim()) {
    return [];
  }

  const filters: FilterState = [];
  const parts = query.trim().split(/\s+/);

  for (const part of parts) {
    // Skip empty parts
    if (!part) continue;

    // Each part should be "key:values"
    const colonIndex = part.indexOf(":");
    if (colonIndex === -1) {
      // Malformed: no colon - skip
      continue;
    }

    const key = part.substring(0, colonIndex);
    const valueString = part.substring(colonIndex + 1);

    // Find column by query key
    const column = Object.keys(FILTER_DEFINITIONS).find(
      (col) => FILTER_DEFINITIONS[col as FilterColumn].queryKey === key,
    ) as FilterColumn | undefined;
    if (!column) continue;

    // Use the actual column name as options key
    if (!(column in options)) continue;

    const availableValues = options[column];
    if (!availableValues) continue;

    // Skip empty values entirely (malformed query)
    if (valueString === "") {
      continue;
    }

    // Parse serialized lower-case values, handling quoted values with colons
    const serializedValues = parseQuotedValues(valueString);
    const availableLowerCaseMap = new Map(
      availableValues.map((val) => [val.toLowerCase(), val]),
    );

    const filterValues = serializedValues
      .map((val) => availableLowerCaseMap.get(val))
      .filter((val): val is string => val !== undefined);

    // If no valid values found, skip this filter
    if (filterValues.length === 0) {
      continue;
    }

    filters.push({
      column: column,
      type: "stringOptions",
      operator: "any of",
      value: filterValues,
    });
  }

  return filters;
}
