import {
  type FilterCondition,
  type FilterColumns,
} from "@/src/features/filters/types";

export function isValidFilter<T extends FilterColumns = []>(
  filter: FilterCondition<T>,
) {
  return (
    filter.column !== null &&
    filter.operator !== null &&
    filter.value !== null &&
    filter.value !== ""
  );
}
