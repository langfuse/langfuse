import { ColumnDefinition, MultiValueOption, SingleValueOption } from "./types";

// Generic helper function that infers the right option type based on column type
export function formatColumnOptions<T extends ColumnDefinition>(
  col: T,
  newOptions: T extends { type: "categoryOptions" }
    ? MultiValueOption[]
    : T extends { type: "stringOptions" | "arrayOptions" }
      ? SingleValueOption[]
      : T extends { type: "numberObject" | "stringObject" | "booleanObject" }
        ? string[]
        : never,
): T {
  // For keyed object filters, set keyOptions instead of options.
  if (
    col.type === "numberObject" ||
    col.type === "stringObject" ||
    col.type === "booleanObject"
  ) {
    return { ...col, keyOptions: newOptions };
  }

  // For other types, set options
  return { ...col, options: newOptions };
}
