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
  stringObject: ["stringObject", "numberObject"],
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

// String-stored object columns (metadata) compare numerically only for
// ordering; equality stays an exact string match via stringObject.
export const NUMERIC_EQUALITY_ON_STRING_OBJECT_ERROR =
  "numberObject metadata filters support only '>', '<', '>=', '<='; use a stringObject filter for equality.";

export const isNumericEqualityOnStringObject = (
  columnType: FilterColumnType,
  filter: { type: string; operator: string },
): boolean =>
  columnType === "stringObject" &&
  filter.type === "numberObject" &&
  filter.operator === "=";

export const getCompatibleFilterTypes = (
  columnType: FilterColumnType,
): readonly CompatibleFilterType[] | null =>
  COMPATIBLE_FILTER_TYPES[columnType] ?? null;
