import {
  FilterState,
  TraceDomain,
  tracesTableUiColumnDefinitions,
} from "@langfuse/shared";

// Uses the uiTableId for mapping fields later.
const evalTraceFilterColumns = [
  "id",
  "bookmarked",
  "name",
  "environment",
  "timestamp",
  "userId",
  "sessionId",
  "metadata",
  "release",
  "version",
  "tags",
] as const;

function getColumnDefinition(column: string) {
  const columnDef = tracesTableUiColumnDefinitions.find(
    (col) =>
      col.uiTableId === column ||
      col.uiTableName === column ||
      col.clickhouseSelect === column,
  );
  if (!columnDef) {
    throw new Error(`Unhandled column for trace filter: ${column}`);
  }
  return columnDef;
}

/**
 * Maps trace filter column names to trace object field values.
 * Uses the centralized table mapping to ensure consistency with UI column definitions.
 */
export function mapTraceFilterColumn(
  trace: TraceDomain,
  column: string,
): unknown {
  const columnDef = getColumnDefinition(column);
  switch (columnDef.uiTableId) {
    case "id":
      return trace.id;
    case "name":
      return trace.name;
    case "timestamp":
      return trace.timestamp;
    case "environment":
      return trace.environment;
    case "tags":
      return trace.tags;
    case "bookmarked":
      return trace.bookmarked;
    case "release":
      return trace.release;
    case "version":
      return trace.version;
    case "userId":
      return trace.userId;
    case "sessionId":
      return trace.sessionId;
    case "metadata":
      return trace.metadata;
    default:
      throw new Error(`Unhandled column in trace filter mapping: ${column}`);
  }
}

/**
 * Determines if a filter requires a database lookup.
 * We make the decision based on whether the filter only selects for allow-listed columns
 */
export function requiresDatabaseLookup(filter: FilterState): boolean {
  if (!filter || filter.length === 0) {
    return false;
  }

  for (const condition of filter) {
    if (
      !evalTraceFilterColumns.some(
        (c) => c === getColumnDefinition(condition.column).uiTableId,
      )
    ) {
      return true;
    }
  }

  return false;
}
