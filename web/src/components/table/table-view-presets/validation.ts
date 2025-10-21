import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type FilterState,
  type ColumnDefinition,
  type OrderByState,
} from "@langfuse/shared";

/**
 * Validates if an orderBy state references valid columns
 */
export function validateOrderBy(
  orderBy: OrderByState | null,
  columns?: LangfuseColumnDef<any, any>[],
): OrderByState | null {
  if (!orderBy || !columns || columns.length === 0) return null;

  // Check if the column exists and supports sorting
  const isValid = columns.some(
    (col) => col.id === orderBy.column && col.enableSorting !== false,
  );
  return isValid ? orderBy : null;
}

/**
 * Validates if filters reference valid columns and normalizes column names to IDs
 *
 * Historical Context (commit ab942e5fa - "unify column id v display handling"):
 * - Old system: filters used display names (e.g., "User ID", "Name", "⭐️")
 * - New system: filters use column IDs (e.g., "userId", "name", "bookmarked")
 *
 * Why the change:
 * - Display names can change for UX or i18n, IDs are stable
 * - IDs match database field names and rest of codebase
 * - Special characters in display names caused issues
 * - Better type safety and predictability
 *
 * This function provides backward compatibility by:
 * 1. Validating that filter columns exist
 * 2. Normalizing old display names to new IDs
 * 3. Filtering out invalid/deleted columns
 */
export function validateFilters(
  filters: FilterState,
  filterColumnDefinition?: ColumnDefinition[],
): FilterState {
  if (!filterColumnDefinition || filterColumnDefinition.length === 0)
    return filters;

  // Validate and normalize filters
  return filters
    .map((filter) => {
      // Find matching column definition (by ID or name for backward compat)
      const matchingDef = filterColumnDefinition.find(
        (def) => def.id === filter.column || def.name === filter.column,
      );

      // Filter is invalid if no matching definition found
      if (!matchingDef) return null;

      // If filter uses old display name, normalize to ID
      if (filter.column !== matchingDef.id) {
        return {
          ...filter,
          column: matchingDef.id,
        };
      }

      // Filter already uses correct ID
      return filter;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
}
