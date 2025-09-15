import {
  type FilterState,
  tracesTableCols,
  singleFilter,
} from "@langfuse/shared";

// Column to query key mapping
const COLUMN_TO_QUERY_KEY = {
  name: "name",
  tags: "tags",
  environment: "env",
  level: "level",
  bookmarked: "bookmarked",
} as const;

type FilterColumn = keyof typeof COLUMN_TO_QUERY_KEY;

export type FilterQueryOptions = {
  [K in FilterColumn]: string[];
};

export const getShortKey = (column: string): string | null => {
  return COLUMN_TO_QUERY_KEY[column as FilterColumn] || null;
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
    // Handle bookmarked filter specially - always boolean type
    if (filter.column === "bookmarked" && filter.type === "boolean") {
      const boolValue = filter.value as boolean;
      serializedParts.push(`bookmarked:${boolValue}`);
      continue;
    }

    // Only handle stringOptions and arrayOptions filters
    if (
      (filter.type !== "stringOptions" && filter.type !== "arrayOptions") ||
      filter.operator !== "any of"
    ) {
      continue;
    }

    const queryKey = COLUMN_TO_QUERY_KEY[filter.column as FilterColumn];
    if (!queryKey) continue;

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
    serializedParts.push(`${queryKey}:${valueString}`);
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

    // Handle bookmarked filter specially - convert boolean to checkbox options
    if (key === "bookmarked") {
      const isBookmarked = valueString === "true";
      filters.push({
        column: "bookmarked",
        type: "boolean",
        operator: "=",
        value: isBookmarked,
      });
      continue;
    }

    // Find column by query key
    const column = Object.keys(COLUMN_TO_QUERY_KEY).find(
      (col) => COLUMN_TO_QUERY_KEY[col as FilterColumn] === key,
    ) as FilterColumn | undefined;
    if (!column) continue;

    if (!(column in options)) continue;

    const availableValues = options[column as FilterColumn];
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

    // Get filter type from table schema
    const columnDef = tracesTableCols.find((col) => col.name === column);
    const filterType = columnDef?.type || "stringOptions";

    const filter = {
      column: column,
      type: filterType,
      operator: "any of",
      value: filterValues,
    };

    // Validate against schema
    const validationResult = singleFilter.safeParse(filter);
    if (validationResult.success) {
      filters.push(validationResult.data);
    } else {
      console.warn(`Invalid filter skipped:`, filter, validationResult.error);
    }
  }

  return filters;
}
