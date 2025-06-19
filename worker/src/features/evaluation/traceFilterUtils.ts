import { FilterState, TraceDomain } from "@langfuse/shared";

const evalTraceFilterColumns = [
  "id",
  "bookmarked",
  "name",
  "environment",
  "timestamp",
  "user_id",
  "session_id",
  "metadata",
  "release",
  "version",
  "tags",
] as const;

/**
 * Maps trace filter column names to trace object field values.
 * This function knows how to extract values from a trace object based on filter column names.
 */
export function mapTraceFilterColumn(
  trace: TraceDomain,
  column: string,
): unknown {
  switch (column) {
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
    case "user_id":
      return trace.userId;
    case "session_id":
      return trace.sessionId;
    case "metadata":
      return trace.metadata;
    default:
      throw new Error(`Unhandled column: ${column}`);
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
      !evalTraceFilterColumns.some((c) => c === condition.column.toLowerCase())
    ) {
      return true;
    }
  }

  return true;
}
