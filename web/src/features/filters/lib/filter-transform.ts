import { type FilterState } from "@langfuse/shared";

/**
 * Maps frontend column IDs to backend-expected column IDs
 * Used when frontend table definitions use different IDs than backend CH mappings
 * such as for tags on the observations table (they are called traceTags in CH)
 */
export type ColumnToBackendKeyMap = Record<string, string>;

/**
 * Transforms FilterState column IDs to backend-expected IDs
 * This is needed when frontend uses different column IDs than backend expects
 *
 * @param filters - FilterState from frontend
 * @param columnMap - Mapping of frontend column ID -> backend column ID
 * @returns Transformed FilterState with backend column IDs
 */
export function transformFiltersForBackend(
  filters: FilterState,
  columnMap: ColumnToBackendKeyMap,
): FilterState {
  return filters.map((filter) => {
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
