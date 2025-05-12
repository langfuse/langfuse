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
 * Validates if filters reference valid columns
 */
export function validateFilters(
  filters: FilterState,
  filterColumnDefinition?: ColumnDefinition[],
): FilterState {
  if (!filterColumnDefinition || filterColumnDefinition.length === 0)
    return filters;

  // Filter out invalid filters
  return filters.filter((filter) => {
    return filterColumnDefinition.some(
      (def) => def.id === filter.column || def.name === filter.column,
    );
  });
}
