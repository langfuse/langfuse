import {
  type ColumnDefinition,
  formatColumnOptions,
  type SingleValueOption,
  scoresTableCols,
} from "@langfuse/shared";

export { scoresTableCols };

export type ScoreOptions = {
  name: Array<SingleValueOption>;
  tags: Array<SingleValueOption>;
  traceName: Array<SingleValueOption>;
  userId: Array<SingleValueOption>;
  stringValue: Array<SingleValueOption>;
};

export function scoresTableColsWithOptions(
  options?: ScoreOptions,
): ColumnDefinition[] {
  return scoresTableCols.map((col) => {
    if (col.id === "name") {
      return formatColumnOptions(col, options?.name ?? []);
    }
    if (col.id === "tags") {
      return formatColumnOptions(col, options?.tags ?? []);
    }
    if (col.id === "traceName") {
      return formatColumnOptions(col, options?.traceName ?? []);
    }
    if (col.id === "userId") {
      return formatColumnOptions(col, options?.userId ?? []);
    }
    if (col.id === "stringValue") {
      return formatColumnOptions(col, options?.stringValue ?? []);
    }
    return col;
  });
}
