import { decodeUnicodeEscapesOnly } from "../../../utils/unicode";

export const stringify = (data: any, key?: string): string => {
  // For comment fields, use pretty-print formatting for better readability
  // Other fields use compact format to reduce file size
  const indent = key === "comments" ? 2 : undefined;

  return JSON.stringify(
    data,
    (k, value) => {
      if (typeof value === "bigint") return Number.parseInt(value.toString());
      if (typeof value === "string")
        return decodeUnicodeEscapesOnly(value, true);
      return value;
    },
    indent,
  );
};

/**
 * CSV-specific stringify that returns strings as-is instead of JSON-encoding them.
 * This avoids double-encoding when string fields (e.g. JSON input/output from ClickHouse)
 * are passed through JSON.stringify and then CSV-escaped.
 */
export const stringifyForCsv = (data: any, key?: string): string => {
  if (typeof data === "string") return decodeUnicodeEscapesOnly(data, true);
  return stringify(data, key);
};
