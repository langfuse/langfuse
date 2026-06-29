import type { ColumnDefinition } from "../../../tableDefinitions";
import type { FilterCondition } from "../../../types";

export const COMPATIBLE_FILTER_TYPES: Partial<
  Record<ColumnDefinition["type"], FilterCondition["type"][]>
> = {
  string: ["string", "stringOptions"],
  stringOptions: ["string", "stringOptions"],
  arrayOptions: ["arrayOptions", "stringOptions"],
  datetime: ["datetime"],
  number: ["number"],
  boolean: ["boolean"],
  stringObject: ["stringObject"],
  numberObject: ["numberObject"],
  categoryOptions: ["categoryOptions", "stringOptions"],
};
