import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type FilterState,
  type ColumnDefinition,
  type OrderByState,
} from "@langfuse/shared";
import { normalizeFilterColumnNames } from "@/src/features/filters/lib/filter-transform";

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
 * - Old system: filters used display names (e.g., "User ID", "Name", "⭐️")
 * - New system: filters use column IDs (e.g., "userId", "name", "bookmarked")
 *
 * Switched to IDs because better:
 * - Display names can change for UX or i18n (in future), IDs are stable
 * - IDs match database field names and rest of codebase
 * - Special characters in display names can cause issues
 * - Better type safety and predictability
 *
 * Here, we:
 * - validate that filter columns exist
 * - normalize old display names to new IDs
 * - filter out invalid/deleted columns
 */
export function validateFilters(
  filters: FilterState,
  filterColumnDefinition?: ColumnDefinition[],
): FilterState {
  if (!filterColumnDefinition || filterColumnDefinition.length === 0)
    return filters;

  // Normalize display names to column IDs for backward compatibility
  const normalized = normalizeFilterColumnNames(
    filters,
    filterColumnDefinition,
  );

  // Validate that columns exist (remove invalid ones)
  return normalized.filter((filter) => {
    return filterColumnDefinition.some(
      (def) => def.id === filter.column || def.name === filter.column,
    );
  });
}
