import type { ColumnDefinition } from "../../../tableDefinitions";
import type { FilterCondition } from "../../../types";

export type FilterColumnType = ColumnDefinition["type"];
export type CompatibleFilterType = FilterCondition["type"];

export const COMPATIBLE_FILTER_TYPES: Partial<
  Record<FilterColumnType, readonly CompatibleFilterType[]>
> = {
  string: ["string", "stringOptions"],
  stringOptions: ["string", "stringOptions"],
  arrayOptions: ["arrayOptions", "stringOptions"],
  datetime: ["datetime"],
  number: ["number"],
  boolean: ["boolean"],
  stringObject: ["stringObject"],
  numberObject: ["numberObject"],
  booleanObject: ["booleanObject"],
  categoryOptions: ["categoryOptions", "stringOptions"],
};

const FILTER_COLUMN_TYPES_WITHOUT_COMPATIBLE_FILTERS = [
  "null",
  "positionInTrace",
] as const satisfies readonly FilterColumnType[];

export const isFilterColumnType = (
  type: string | undefined,
): type is FilterColumnType =>
  typeof type === "string" &&
  (Object.hasOwn(COMPATIBLE_FILTER_TYPES, type) ||
    FILTER_COLUMN_TYPES_WITHOUT_COMPATIBLE_FILTERS.some(
      (filterColumnType) => filterColumnType === type,
    ));

export const getCompatibleFilterTypes = (
  columnType: FilterColumnType,
): readonly CompatibleFilterType[] | null =>
  COMPATIBLE_FILTER_TYPES[columnType] ?? null;
