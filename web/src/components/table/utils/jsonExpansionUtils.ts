/**
 * Utility functions for JSON expansion state management across traces
 */

/** Arrays at or below this size show every item in the parent-row preview. */
export const SMALL_ARRAY_THRESHOLD = 5;

/** Objects at or below this many primitive fields show those fields inline. */
export const SMALL_OBJECT_THRESHOLD = 2;

const DEEPEST_DEFAULT_EXPANSION_LEVEL = 10;

// Convert row ID (e.g., "metadata-settings-theme") to key path (e.g., "metadata.settings.theme")
export function convertRowIdToKeyPath(rowId: string): string {
  return rowId.replace(/-/g, ".");
}

// Utility function to get children from lazy-loaded rows
function getRowChildren(row: JsonTableRow): JsonTableRow[] {
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

function isPrimitiveJsonValue(value: unknown): boolean {
  const type = getValueType(value);
  return type !== "object" && type !== "array";
}

/**
 * True when the table's single-row array preview already shows every item
 * completely (a short list of primitives). Those lists should stay collapsed
 * by default so the preview is not duplicated as child rows.
 */
export function arrayFitsInSingleRowPreview(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (value.length > SMALL_ARRAY_THRESHOLD) return false;
  return value.every(isPrimitiveJsonValue);
}

/**
 * True when the table's single-row object preview already shows every field
 * completely (a short object of primitives). Those objects should stay
 * collapsed by default so the preview is not duplicated as child rows.
 */
export function objectFitsInSingleRowPreview(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > SMALL_OBJECT_THRESHOLD) {
    return false;
  }
  return entries.every(([, field]) => isPrimitiveJsonValue(field));
}

function valueFitsInSingleRowPreview(value: unknown): boolean {
  return (
    arrayFitsInSingleRowPreview(value) || objectFitsInSingleRowPreview(value)
  );
}

function findOptimalExpansionLevel(
  data: JsonTableRow[],
  maxRows: number,
): number {
  if (data.length > maxRows) {
    return 0;
  }

  function findOptimalRecursively(
    rows: JsonTableRow[],
    currentLevel: number,
    cumulativeCount: number,
    visitedData = new WeakSet(),
  ): number {
    const rowsAtThisLevel = rows.length;
    const newCumulativeCount = cumulativeCount + rowsAtThisLevel;

    if (newCumulativeCount > maxRows) {
      return currentLevel - 1;
    }

    if (currentLevel >= DEEPEST_DEFAULT_EXPANSION_LEVEL) {
      return currentLevel;
    }

    let childRows: JsonTableRow[] = [];

    for (const row of rows) {
      // Short primitive lists stay collapsed; don't spend the row budget on
      // children the user will not see by default.
      if (valueFitsInSingleRowPreview(row.value)) continue;

      if (row.hasChildren && row.rawChildData) {
        if (typeof row.rawChildData !== "object" || row.rawChildData === null) {
          continue;
        }

        if (visitedData.has(row.rawChildData)) {
          continue;
        }

        visitedData.add(row.rawChildData);

        const children = getRowChildren(row);
        // Use concat instead of spread to avoid stack overflow with large arrays
        childRows = childRows.concat(children);
      }
    }

    if (childRows.length === 0) {
      return currentLevel;
    }

    return findOptimalRecursively(
      childRows,
      currentLevel + 1,
      newCumulativeCount,
      visitedData,
    );
  }

  return Math.max(0, findOptimalRecursively(data, 0, 0));
}

/**
 * Default expand/collapse map for the pretty JSON table.
 * Short primitive lists and short primitive objects stay collapsed because
 * their parent-row preview already shows the full contents.
 */
export function getSmartExpansionState(
  data: JsonTableRow[],
  maxRows: number,
): Record<string, boolean> {
  const optimalLevel = findOptimalExpansionLevel(data, maxRows);
  if (optimalLevel <= 0) return {};

  const smartExpanded: Record<string, boolean> = {};

  const expandRowsToLevel = (rows: JsonTableRow[], currentLevel: number) => {
    for (const row of rows) {
      if (
        !row.hasChildren ||
        currentLevel >= optimalLevel ||
        valueFitsInSingleRowPreview(row.value)
      ) {
        continue;
      }

      smartExpanded[convertRowIdToKeyPath(row.id)] = true;
      const children = getRowChildren(row);
      if (children.length > 0) {
        expandRowsToLevel(children, currentLevel + 1);
      }
    }
  };

  expandRowsToLevel(data, 0);
  return smartExpanded;
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
