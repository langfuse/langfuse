import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type FilterState,
  type ColumnDefinition,
  type OrderByState,
} from "@langfuse/shared";
import { normalizeFilterColumnNames } from "@/src/features/filters/lib/filter-transform";

/**
 * Validates if an orderBy state references valid columns.
 * Normalizes legacy column IDs (e.g. "name" → "traceName") via aliases.
 */
export function validateOrderBy(
  orderBy: OrderByState | null,
  columns?: LangfuseColumnDef<any, any>[],
  filterColumnDefinitions?: ColumnDefinition[],
): OrderByState | null {
  if (!orderBy || !columns || columns.length === 0) return null;

  const isSortableColumn = (columnId: string) =>
    columns.some((col) => col.id === columnId && col.enableSorting !== false);

  // If the column already exists in the active table, keep it.
  if (isSortableColumn(orderBy.column)) {
    return orderBy;
  }

  // Resolve legacy/canonical IDs via filter-layer aliases (e.g. "name" ↔ "traceName")
  let resolvedColumn: string | null = null;
  if (filterColumnDefinitions) {
    const colDef = filterColumnDefinitions.find(
      (c) =>
        c.id === orderBy.column ||
        c.name === orderBy.column ||
        c.aliases?.includes(orderBy.column),
    );
    if (colDef) {
      const candidates = [colDef.id, ...(colDef.aliases ?? [])];
      resolvedColumn =
        candidates.find((candidate) => isSortableColumn(candidate)) ?? null;
    }
  }

  return resolvedColumn ? { ...orderBy, column: resolvedColumn } : null;
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
  // After normalization, filter.column is always a canonical ID
  return normalized.filter((filter) => {
    return filterColumnDefinition.some((def) => def.id === filter.column);
  });
}
