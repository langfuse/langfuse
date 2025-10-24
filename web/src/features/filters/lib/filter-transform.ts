import { type FilterState, type ColumnDefinition } from "@langfuse/shared";

/**
 * Maps frontend column IDs to backend-expected column IDs
 * Used when frontend table definitions use different IDs than backend CH mappings
 * such as for tags on the observations table (they are called traceTags in CH)
 */
export type ColumnToBackendKeyMap = Record<string, string>;

/**
 * Normalizes filter column names from display names to column IDs
 * Handles backward compatibility where old URLs/saved views used display names ("Environment")
 * and new system uses column IDs ("environment")
 *
 * @param filters - FilterState that may contain display names or column IDs
 * @param columnDefinitions - Column definitions for lookup
 * @returns FilterState with all column names normalized to IDs
 */
export function normalizeFilterColumnNames(
  filters: FilterState,
  columnDefinitions: ColumnDefinition[],
): FilterState {
  return filters.map((filter) => {
    const colDef = columnDefinitions.find(
      (c) => c.id === filter.column || c.name === filter.column,
    );
    if (colDef && colDef.id !== filter.column) {
      return { ...filter, column: colDef.id };
    }
    return filter;
  });
}

/**
 * Transforms frontend filter column IDs to backend-expected column IDs
 *
 * Note: Display name normalization ("Environment" → "environment") now happens earlier
 * in useSidebarFilterState after URL decoding. This function only handles backend remapping.
 *
 * @param filters - FilterState from frontend (already has column IDs, not display names)
 * @param columnMap - Mapping of frontend column ID -> backend column ID (e.g., "tags" → "traceTags")
 * @param columnDefinitions - Not used anymore (kept for backward compatibility)
 * @returns FilterState with backend-mapped column IDs
 */
export function transformFiltersForBackend(
  filters: FilterState,
  columnMap: ColumnToBackendKeyMap,
  _columnDefinitions?: ColumnDefinition[],
): FilterState {
  return filters.map((filter) => {
    // Apply backend column remapping (e.g., "tags" → "traceTags" for ClickHouse)
    const backendColumnId = columnMap[filter.column];
    if (backendColumnId && backendColumnId !== filter.column) {
      return {
        ...filter,
        column: backendColumnId,
      };
    }
    return filter;
  });
}
