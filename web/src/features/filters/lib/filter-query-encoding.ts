import {
  type FilterExpression,
  type FilterInput,
  type FilterState,
  filterExpression,
  singleFilter,
  type SingleValueOption,
} from "@langfuse/shared";
import { normalizeLegacySessionPositionInTraceKey } from "@/src/components/session/session-position-in-trace";

const encodeDelimitedArray = (values: string[], delimiter: string): string =>
  values.join(delimiter);

const decodeDelimitedArray = (
  value: string,
  delimiter: string,
): string[] | undefined => {
  if (value === "") {
    return [];
  }

  return value.split(delimiter);
};

// Escape pipe characters in values to avoid conflicts with the delimiter
// Uses backslash escaping: | → \|, and \ → \\
export function escapePipeInValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

export function unescapePipeInValue(value: string): string {
  return value.replace(/\\\|/g, "|").replace(/\\\\/g, "\\");
}

// Split on unescaped pipe characters only (pipes not preceded by backslash)
export function splitOnUnescapedPipe(str: string): string[] {
  const result: string[] = [];
  let current = "";
  let i = 0;

  while (i < str.length) {
    if (str[i] === "\\" && i + 1 < str.length) {
      // Escaped character - include both backslash and next char
      current += str[i] + str[i + 1];
      i += 2;
    } else if (str[i] === "|") {
      // Unescaped pipe - split here
      result.push(current);
      current = "";
      i++;
    } else {
      current += str[i];
      i++;
    }
  }
  result.push(current);

  return result;
}

// Generic helpers for reusable encoding/decoding across feature areas
export type GenericFilterOptions = Record<
  string,
  string[] | (string | SingleValueOption)[] | Record<string, string[]>
>;

// Pure helper: compute UI-selected values from a filter entry and available values
export function computeSelectedValues(
  availableValues: string[],
  filterEntry:
    | { operator?: string; value?: unknown; type?: string }
    | undefined,
): string[] {
  if (!filterEntry) return availableValues;
  const values = (filterEntry.value as string[]) ?? [];
  if (filterEntry.type === "arrayOptions") {
    return values;
  }
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
export function encodeFiltersGeneric(filters: FilterState): string {
  return (
    encodeDelimitedArray(
      filters
        .map((f) => {
          // Determine the key field (for categoryOptions, numberObject, stringObject)
          const key =
            f.type === "numberObject" ||
            f.type === "stringObject" ||
            f.type === "categoryOptions" ||
            f.type === "positionInTrace"
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
            // Escape pipe characters in individual values before joining with pipe delimiter
            const escapedValues = (f.value as string[]).map(escapePipeInValue);
            encodedValue = encodeURIComponent(escapedValues.join("|"));
          } else if (f.type === "positionInTrace") {
            encodedValue =
              f.value === undefined || f.value === null
                ? ""
                : encodeURIComponent(String(f.value));
          } else {
            encodedValue = encodeURIComponent(String(f.value));
          }

          return `${f.column};${f.type};${key};${f.operator};${encodedValue}`;
        })
        .filter((s): s is string => s !== null),
      ",",
    ) || ""
  );
}

/**
 * Decodes the legacy semicolon-delimited format to FilterState
 * Format: column;type;key;operator;value
 */
export function decodeFiltersGeneric(query: string): FilterState {
  if (!query.trim()) return [];

  const decoded = decodeDelimitedArray(query, ",");
  if (!decoded) return [];

  const filters: FilterState = [];

  for (const filterString of decoded) {
    if (!filterString) continue;

    const [column, type, key, operator, encodedValue] = filterString.split(";");

    if (!column || !type || !operator || encodedValue === undefined) {
      continue;
    }

    const decodedOperator = decodeURIComponent(operator);
    const decodedKey = key ? decodeURIComponent(key) : "";
    const normalizedKey =
      type === "positionInTrace"
        ? normalizeLegacySessionPositionInTraceKey(decodedKey)
        : decodedKey;
    const decodedValue = decodeURIComponent(encodedValue);

    // Parse value based on type
    let parsedValue: any;
    if (type === "datetime") {
      parsedValue = new Date(decodedValue);
    } else if (type === "number" || type === "numberObject") {
      parsedValue = Number(decodedValue);
    } else if (type === "positionInTrace") {
      parsedValue = decodedValue === "" ? undefined : Number(decodedValue);
    } else if (
      type === "stringOptions" ||
      type === "arrayOptions" ||
      type === "categoryOptions"
    ) {
      // Split on unescaped pipe characters only, then unescape each value
      parsedValue = decodedValue
        ? splitOnUnescapedPipe(decodedValue).map(unescapePipeInValue)
        : type === "arrayOptions"
          ? [] // Empty array for arrayOptions — empty strings are not valid array values (e.g., tags)
          : decodedValue === ""
            ? [""] // allow empty strings for stringOptions (i.e, filter for empty trace name)
            : [decodedValue];
    } else if (type === "boolean") {
      parsedValue = decodedValue === "true";
    } else {
      parsedValue = decodedValue;
    }

    // Build filter object
    const filter: any = {
      column,
      type,
      operator: decodedOperator,
      value: parsedValue,
    };

    // Add key field for types that need it
    if (normalizedKey) {
      if (
        type === "categoryOptions" ||
        type === "numberObject" ||
        type === "stringObject" ||
        type === "positionInTrace"
      ) {
        filter.key = normalizedKey;
      }
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

// Search/Filter v2: the URL `filter` param can hold either the legacy flat
// delimited FilterState (above) OR a nested FilterExpression tree. A tree is
// encoded as JSON, which always begins with `{` — a character the delimited
// format (which starts with a column name) never produces — so the two are
// unambiguously distinguishable on decode. Flat arrays keep using the compact
// delimited encoding, so every existing URL and saved view is unchanged.

function isFilterTree(input: FilterInput): input is FilterExpression {
  return !Array.isArray(input);
}

/**
 * Encode a {@link FilterInput} for the URL `filter` param. Flat arrays use the
 * legacy delimited format; a nested tree uses JSON (Date values serialize to
 * ISO strings and re-coerce on decode via the timeFilter schema).
 */
export function encodeFilterInput(
  input: FilterInput | null | undefined,
): string {
  if (input == null) return "";
  if (isFilterTree(input)) {
    return JSON.stringify(input);
  }
  return encodeFiltersGeneric(input);
}

/**
 * Decode the URL `filter` param to a {@link FilterInput}. A leading `{` marks a
 * JSON-encoded tree (validated structurally via the filterExpression schema);
 * anything else is the legacy delimited flat format.
 */
export function decodeFilterInput(query: string): FilterInput {
  if (!query.trim()) return [];

  if (query.trimStart().startsWith("{")) {
    try {
      const parsed = filterExpression.safeParse(JSON.parse(query));
      if (parsed.success) return parsed.data;
      console.warn("Invalid filter expression skipped:", parsed.error);
    } catch (error) {
      console.warn("Error decoding filter expression:", error);
    }
    return [];
  }

  return decodeFiltersGeneric(query);
}
