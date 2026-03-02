/**
 * Helper to convert ClickHouse filter parameters to MySQL positional parameters
 */

import { convertDateToDateTime } from "./dateUtils";

export function convertFilterParamsToPositional(
  filterQuery: string,
  filterParams: Record<string, unknown>,
): {
  query: string;
  params: unknown[];
} {
  // This is a simplified version
  // You'll need to replace {paramName: Type} with ? and track parameter order
  const params: unknown[] = [];
  let convertedQuery = filterQuery;

  // Match all ClickHouse parameters in order
  const paramPattern = /\{([a-zA-Z_][a-zA-Z0-9_]*):\s*[^}]+\}/g;
  const matches = Array.from(filterQuery.matchAll(paramPattern));

  // Helper function to convert parameter value
  const convertParamValue = (value: unknown): unknown => {
    // Check if it's a Date object
    if (value instanceof Date) {
      return convertDateToDateTime(value);
    }
    // Check if it's a Unix timestamp (milliseconds)
    if (typeof value === "number" && value > 1000000000000) {
      return convertDateToDateTime(value);
    }
    return value;
  };

  // First, collect params in forward order (as they appear in the query)
  for (const match of matches) {
    const paramName = match[1];
    const paramValue = filterParams[paramName];

    if (Array.isArray(paramValue)) {
      // Convert each element in the array
      params.push(...paramValue.map(convertParamValue));
    } else {
      // Convert single value
      params.push(convertParamValue(paramValue));
    }
  }

  // Replace from end to start to preserve string indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const paramValue = filterParams[match[1]];

    if (Array.isArray(paramValue)) {
      // For arrays, expand to (?, ?, ?)
      const placeholders = paramValue.map(() => "?").join(", ");
      convertedQuery =
        convertedQuery.substring(0, match.index) +
        `(${placeholders})` +
        convertedQuery.substring(match.index + match[0].length);
    } else {
      convertedQuery =
        convertedQuery.substring(0, match.index) +
        "?" +
        convertedQuery.substring(match.index + match[0].length);
    }
  }

  // Remove FINAL keyword
  convertedQuery = convertedQuery.replace(/\bFINAL\b/gi, "");

  // Fix double parentheses in IN/NOT IN clauses: IN ((?)) -> IN (?)
  // This happens when ClickHouse uses IN ({param: Array(String)}) and we convert it
  convertedQuery = convertedQuery.replace(
    /(IN|NOT IN)\s*\(\(([^)]+)\)\)/gi,
    (match, operator, content) => {
      // If content contains only placeholders (?, ?, ?), remove outer parentheses
      const trimmed = content.trim();
      if (/^(\?,\s*)*\?$/.test(trimmed)) {
        return `${operator} (${trimmed})`;
      }
      return match;
    },
  );

  // Convert double quotes to backticks for OceanBase/MySQL compatibility
  convertedQuery = convertedQuery.replace(/"([^"]+)"/g, "`$1`");

  return {
    query: convertedQuery,
    params: params,
  };
}
