import { type FilterState, type ColumnDefinition } from "@langfuse/shared";

/**
 * Maps frontend column IDs to backend-expected column IDs
 * Used when frontend table definitions use different IDs than backend CH mappings
 * such as for tags on the observations table (they are called traceTags in CH)
 */
export type ColumnToBackendKeyMap = Record<string, string>;

/**
 * Normalizes filter column names to IDs and transforms to backend-expected IDs
 *
 * Performs two transformations:
 * 1. Name → ID normalization: "Environment" → "environment"
 * 2. Frontend ID → Backend ID remapping: "tags" → "traceTags" (for CH column mapping)
 *
 * @param filters - FilterState from frontend (may have names or IDs)
 * @param columnMap - Mapping of frontend column ID -> backend column ID
 * @param columnDefinitions - Column definitions for name→id normalization
 * @returns Transformed FilterState with normalized and backend-mapped column IDs
 */
export function transformFiltersForBackend(
  filters: FilterState,
  columnMap: ColumnToBackendKeyMap,
  columnDefinitions?: ColumnDefinition[],
): FilterState {
  return filters.map((filter) => {
    let normalizedColumn = filter.column;

    // Step 1: Normalize column name to ID (if columnDefinitions provided)
    // This handles filters created by PopoverFilterBuilder that use column.name instead of column.id
    if (columnDefinitions) {
      const colDef = columnDefinitions.find(
        (c) => c.id === filter.column || c.name === filter.column,
      );
      if (colDef && colDef.id !== filter.column) {
        normalizedColumn = colDef.id;
      }
    }

    // Step 2: Apply backend column remapping (e.g., "tags" → "traceTags")
    const backendColumnId = columnMap[normalizedColumn];
    if (backendColumnId && backendColumnId !== normalizedColumn) {
      return {
        ...filter,
        column: backendColumnId,
      };
    }

    // Return with normalized column if it changed
    if (normalizedColumn !== filter.column) {
      return {
        ...filter,
        column: normalizedColumn,
      };
    }

    return filter;
  });
}
