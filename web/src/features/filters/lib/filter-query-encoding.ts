import { type FilterState } from "@langfuse/shared";

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

function splitQueryParts(query: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < query.length) {
    const char = query[i];

    if (char === "\\") {
      // Escaped character - include backslash and next character
      current += char;
      if (i + 1 < query.length) {
        i++;
        current += query[i];
      }
    } else if (char === '"') {
      // Toggle quote state and include the quote
      inQuotes = !inQuotes;
      current += char;
    } else if (char === " " && !inQuotes && current.trim()) {
      // Unescaped space outside quotes - end current part
      parts.push(current);
      current = "";
    } else if (char !== " " || inQuotes) {
      // Regular character, or space inside quotes
      current += char;
    }

    i++;
  }

  // Add the last part
  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

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
  options?: Partial<GenericFilterOptions>,
): string {
  const serializedParts: string[] = [];
  const processedNumericColumns = new Set<string>();

  for (const filter of filters) {
    // boolean filters: key:true|false
    if (filter.type === "boolean") {
      const queryKey = columnToQueryKey[filter.column];
      if (!queryKey) continue;
      serializedParts.push(`${queryKey}:${Boolean(filter.value)}`);
      continue;
    }

    // string filters: key:*value* (contains operator)
    if (filter.type === "string") {
      const queryKey = columnToQueryKey[filter.column];
      if (!queryKey) continue;
      const value = String(filter.value ?? "").trim();
      if (value === "") continue;
      // Escape spaces and asterisks with backslashes
      const escapedValue = value
        .replace(/\\/g, "\\\\")
        .replace(/ /g, "\\ ")
        .replace(/\*/g, "\\*");
      serializedParts.push(`${queryKey}:*${escapedValue}*`);
      continue;
    }

    // number filters: combine >= and <= into bracket notation [min,max]
    if (filter.type === "number") {
      const queryKey = columnToQueryKey[filter.column];
      if (!queryKey || processedNumericColumns.has(filter.column)) continue;

      // Look for both >= and <= filters for this column
      const gteFilter = filters.find(
        (f) =>
          f.column === filter.column &&
          f.type === "number" &&
          f.operator === ">=",
      );
      const lteFilter = filters.find(
        (f) =>
          f.column === filter.column &&
          f.type === "number" &&
          f.operator === "<=",
      );

      if (
        gteFilter &&
        lteFilter &&
        typeof gteFilter.value === "number" &&
        typeof lteFilter.value === "number"
      ) {
        // Both operators present: use bracket notation
        serializedParts.push(
          `${queryKey}:[${gteFilter.value},${lteFilter.value}]`,
        );
        processedNumericColumns.add(filter.column);
      } else if (filter.operator === ">=" && typeof filter.value === "number") {
        // Only >= operator
        serializedParts.push(`${queryKey}:>=${filter.value}`);
        processedNumericColumns.add(filter.column);
      } else if (filter.operator === "<=" && typeof filter.value === "number") {
        // Only <= operator
        serializedParts.push(`${queryKey}:<=${filter.value}`);
        processedNumericColumns.add(filter.column);
      }
      continue;
    }

    // categoryOptions filters: queryKey.key:value1,value2
    if (filter.type === "categoryOptions") {
      const queryKey = columnToQueryKey[filter.column];
      if (!queryKey) continue;

      const key = (filter as any).key;
      const selectedValues = (filter.value as string[]) || [];
      if (!key || selectedValues.length === 0) continue;

      // Quote key if it contains special characters
      const needsQuotingKey =
        key.includes(" ") || key.includes(".") || key.includes(":");
      const serializedKey = needsQuotingKey ? `"${key}"` : key;

      const serializedValues = selectedValues.map((val) => {
        const lowerVal = val.toLowerCase();
        return lowerVal.includes(":") ||
          lowerVal.includes(",") ||
          lowerVal.includes(" ")
          ? `"${lowerVal}"`
          : lowerVal;
      });
      const valueString = serializedValues.join(",");
      const prefix = filter.operator === "none of" ? "-" : "";
      serializedParts.push(
        `${prefix}${queryKey}.${serializedKey}:${valueString}`,
      );
      continue;
    }

    // numberObject filters: queryKey.key:operator:value (e.g., scoresNumeric.accuracy:>=:0.8)
    if (filter.type === "numberObject") {
      const queryKey = columnToQueryKey[filter.column];
      if (!queryKey) continue;

      const key = (filter as any).key;
      const operator = (filter as any).operator;
      const value = (filter as any).value;
      if (!key || typeof value !== "number") continue;

      // Quote key if it contains special characters
      const needsQuotingKey =
        key.includes(" ") || key.includes(".") || key.includes(":");
      const serializedKey = needsQuotingKey ? `"${key}"` : key;

      serializedParts.push(`${queryKey}.${serializedKey}:${operator}:${value}`);
      continue;
    }

    // stringObject filters: queryKey.key=value or queryKey.key*=value or queryKey.key!=value
    if (filter.type === "stringObject") {
      const queryKey = columnToQueryKey[filter.column];
      if (!queryKey) continue;

      const key = (filter as any).key;
      const operator = (filter as any).operator;
      const value = (filter as any).value;
      if (!key || !value) continue;

      // Quote key if it contains special characters
      const needsQuotingKey =
        key.includes(" ") ||
        key.includes(".") ||
        key.includes(":") ||
        key.includes("=");
      const serializedKey = needsQuotingKey ? `"${key}"` : key;

      // Quote value if it contains special characters
      const needsQuotingValue =
        value.includes(" ") || value.includes(":") || value.includes("=");
      const serializedValue = needsQuotingValue ? `"${value}"` : value;

      // Map operator to symbol
      const operatorSymbol =
        operator === "="
          ? "="
          : operator === "contains"
            ? "*="
            : operator === "does not contain"
              ? "!="
              : "="; // fallback

      serializedParts.push(
        `${queryKey}.${serializedKey}${operatorSymbol}${serializedValue}`,
      );
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

    const availableValuesRaw = options?.[filter.column] ?? [];
    // Handle both flat arrays and nested objects (for keyValue filters)
    const availableValues = Array.isArray(availableValuesRaw)
      ? availableValuesRaw
      : [];
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
  options: Partial<GenericFilterOptions>,
  getType?: (column: string) => any,
): FilterState {
  if (!query.trim()) return [];

  const filters: FilterState = [];
  const parts = splitQueryParts(query.trim());

  for (const part of parts) {
    if (!part) continue;
    const isExclusive = part.startsWith("-");
    const cleanPart = isExclusive ? part.substring(1) : part;

    // Check for stringObject filters first (format: queryKey.key=value or queryKey.key*=value or queryKey.key!=value)
    if (cleanPart.includes(".")) {
      // Try to match symbol-based operators (=, *=, !=)
      const dotIndex = cleanPart.indexOf(".");
      const queryKey = cleanPart.substring(0, dotIndex);
      const afterDot = cleanPart.substring(dotIndex + 1);

      // Check for symbol operators
      let operatorMatch: RegExpMatchArray | null = null;
      let operator: "=" | "contains" | "does not contain" | null = null;

      if (afterDot.includes("!=")) {
        operatorMatch = afterDot.match(/^(.+?)!=(.+)$/);
        operator = "does not contain";
      } else if (afterDot.includes("*=")) {
        operatorMatch = afterDot.match(/^(.+?)\*=(.+)$/);
        operator = "contains";
      } else if (afterDot.includes("=") && !afterDot.includes(":")) {
        // Only match = if there's no colon (to avoid matching category/number filters)
        operatorMatch = afterDot.match(/^(.+?)=(.+)$/);
        operator = "=";
      }

      if (operatorMatch && operator) {
        let key = operatorMatch[1];
        let value = operatorMatch[2];

        // Remove quotes if present
        if (key.startsWith('"') && key.endsWith('"')) {
          key = key.substring(1, key.length - 1);
        }
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }

        // Find column from query key
        const column = Object.keys(columnToQueryKey).find(
          (c) => columnToQueryKey[c] === queryKey,
        );
        if (column) {
          filters.push({
            column,
            type: "stringObject",
            operator,
            key,
            value,
          } as any);
          continue;
        }
      }
    }

    const colonIndex = cleanPart.indexOf(":");
    if (colonIndex === -1) continue;

    const key = cleanPart.substring(0, colonIndex);
    const valueString = cleanPart.substring(colonIndex + 1);

    // categoryOptions and numberObject filters: queryKey.key:value1,value2 OR queryKey.key:operator:value
    // Check if key contains a dot (e.g., ratings.danger or scoresNumeric.accuracy) BEFORE looking up column
    if (key.includes(".")) {
      const dotIndex = key.indexOf(".");
      const queryKey = key.substring(0, dotIndex);
      let categoryKey = key.substring(dotIndex + 1);

      // Handle quoted keys (e.g., "fossil quality")
      if (categoryKey.startsWith('"') && categoryKey.endsWith('"')) {
        categoryKey = categoryKey.substring(1, categoryKey.length - 1);
      }

      // Find column from query key
      const column = Object.keys(columnToQueryKey).find(
        (c) => columnToQueryKey[c] === queryKey,
      );
      if (!column) continue;

      // Check if this is a numberObject filter (format: operator:value)
      const operatorMatch = valueString.match(/^(=|>|<|>=|<=):(.+)$/);
      if (operatorMatch) {
        const operator = operatorMatch[1] as "=" | ">" | "<" | ">=" | "<=";
        const numericValue = parseFloat(operatorMatch[2]);
        if (!isNaN(numericValue)) {
          filters.push({
            column,
            type: "numberObject",
            operator,
            key: categoryKey,
            value: numericValue,
          } as any);
          continue;
        }
      }

      // Parse as categoryOptions
      const serializedValues = parseQuotedValues(valueString);
      if (serializedValues.length === 0) continue;

      filters.push({
        column,
        type: "categoryOptions",
        operator: isExclusive ? "none of" : "any of",
        key: categoryKey,
        value: serializedValues,
      } as any);
      continue;
    }

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

    // string filters: key:*value* (contains operator)
    const stringMatch = valueString.match(/^\*(.+)\*$/);
    if (stringMatch) {
      const escapedValue = stringMatch[1];
      // Unescape backslashes, spaces, and asterisks
      const decodedValue = escapedValue
        .replace(/\\\*/g, "*")
        .replace(/\\ /g, " ")
        .replace(/\\\\/g, "\\");
      filters.push({
        column: columnFromBoolean,
        type: "string",
        operator: "contains",
        value: decodedValue,
      } as any);
      continue;
    }

    // number filters: key:[min,max] (range) or key:>=value or key:<=value (single bound)
    // Check for bracket notation first [min,max]
    const bracketMatch = valueString.match(/^\[(-?[0-9.]+),(-?[0-9.]+)\]$/);
    if (bracketMatch) {
      const minValue = parseFloat(bracketMatch[1]);
      const maxValue = parseFloat(bracketMatch[2]);
      if (!isNaN(minValue) && !isNaN(maxValue)) {
        filters.push(
          {
            column: columnFromBoolean,
            type: "number",
            operator: ">=",
            value: minValue,
          } as any,
          {
            column: columnFromBoolean,
            type: "number",
            operator: "<=",
            value: maxValue,
          } as any,
        );
        continue;
      }
    }

    // Check for single-sided operators (>= or <=)
    const numericMatch = valueString.match(/^(>=|<=)(.+)$/);
    if (numericMatch) {
      const operator = numericMatch[1] as ">=" | "<=";
      const numValue = parseFloat(numericMatch[2]);
      if (!isNaN(numValue)) {
        filters.push({
          column: columnFromBoolean,
          type: "number",
          operator,
          value: numValue,
        } as any);
        continue;
      }
    }

    const availableValuesRaw = options[columnFromBoolean] ?? [];
    // Handle both flat arrays and nested objects (for keyValue filters)
    const availableValues = Array.isArray(availableValuesRaw)
      ? availableValuesRaw
      : [];
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
