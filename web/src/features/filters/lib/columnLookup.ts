import { type TableName } from "@langfuse/shared";

type ColumnDef = { id: string; name: string };

type ColumnRegistry = {
  [K in TableName]?: readonly ColumnDef[];
};

/**
 * Resolves a column entry on `table` by either its stable id or its
 * human-readable display name.
 *
 * Tolerance contract:
 * - Matches are exact and case-sensitive. Neither id nor display name is
 *   normalized (no trimming, no lower-casing). Callers that need to
 *   tolerate user/LLM-provided input must normalize upstream.
 * - The lookup is strictly scoped to `table`. A column defined only in
 *   another table's registry (for example an observations-only column)
 *   returns `undefined` here even if its id is well known.
 * - Matching by id and by display name are equivalent: both return the
 *   column's stable id. This is the LLM-tolerance layer for filter-state
 *   URL encoding.
 */
export function getColumnId(
  tableCols: ColumnRegistry,
  table: TableName,
  name: string,
): string | undefined {
  return tableCols[table]?.find((col) => col.name === name || col.id === name)
    ?.id;
}

/**
 * Inverse of {@link getColumnId}: resolves a column's display name on
 * `table` from its stable id. Does not perform the LLM-tolerance fallback
 * (name-match) — callers must pass the canonical id.
 */
export function getColumnName(
  tableCols: ColumnRegistry,
  table: TableName,
  id: string,
): string | undefined {
  return tableCols[table]?.find((col) => col.id === id)?.name;
}