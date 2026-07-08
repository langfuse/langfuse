/**
 * Utility functions for JSON expansion state management across traces
 */

// Convert row ID (e.g., "metadata-settings-theme") to key path (e.g., "metadata.settings.theme")
export function convertRowIdToKeyPath(rowId: string): string {
  return rowId.replace(/-/g, ".");
}

// Utility function to get children from lazy-loaded rows
export function getRowChildren(row: JsonTableRow): JsonTableRow[] {
  if (row.subRows && row.subRows.length > 0) {
    return row.subRows;
  }
  if (row.rawChildData) {
    // Prevent infinite recursion by limiting depth; 25 levels of nesting should make a reasonable assumption
    if (row.level > 25) {
      return [];
    }
    return transformJsonToTableData(
      row.rawChildData,
      row.key,
      row.level + 1,
      row.id,
      false, // Don't lazy load for child generation
    );
  }
  return [];
}

// Types for JSON table rows
export interface JsonTableRow {
  id: string;
  key: string;
  value: unknown;
  type:
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "null"
    | "undefined";
  hasChildren: boolean;
  level: number;
  subRows?: JsonTableRow[];
  // For lazy loading of sub-row table data
  rawChildData?: unknown;
  childrenGenerated?: boolean;
}

function getValueType(value: unknown): JsonTableRow["type"] {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonTableRow["type"];
}

function hasChildren(value: unknown, valueType: JsonTableRow["type"]): boolean {
  return (
    (valueType === "object" &&
      Object.keys(value as Record<string, unknown>).length > 0) ||
    (valueType === "array" && Array.isArray(value) && value.length > 0)
  );
}

export function transformJsonToTableData(
  json: unknown,
  parentKey = "",
  level = 0,
  parentId = "",
  lazy = false,
): JsonTableRow[] {
  const rows: JsonTableRow[] = [];

  if (typeof json !== "object" || json === null) {
    return [
      {
        id: parentId || "0",
        key: parentKey || "root",
        value: json,
        type: getValueType(json),
        hasChildren: false,
        level,
      },
    ];
  }

  const entries = Array.isArray(json)
    ? json.map((item, index) => [index.toString(), item])
    : Object.entries(json);

  entries.forEach(([key, value]) => {
    const id = parentId ? `${parentId}-${key}` : key;
    const valueType = getValueType(value);
    const childrenExist = hasChildren(value, valueType);

    const row: JsonTableRow = {
      id,
      key,
      value,
      type: valueType,
      hasChildren: childrenExist,
      level,
      childrenGenerated: false,
    };

    if (childrenExist) {
      if (lazy && level === 0) {
        // For lazy loading, store raw data instead of processing children
        row.rawChildData = value;
        row.subRows = []; // Empty initially
      } else {
        // Normal processing or nested children
        const children = transformJsonToTableData(
          value,
          key,
          level + 1,
          id,
          lazy,
        );
        row.subRows = children;
        row.childrenGenerated = true;
      }
    }

    rows.push(row);
  });

  return rows;
}
