import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "@/src/server/api/interfaces/tableDefinition";

export const scoresTableCols: ColumnDefinition[] = [
  { name: "trace_id", type: "string", internal: 's."trace_id"' },
  { name: "observation_id", type: "string", internal: 's."observation_id"' },
  { name: "timestamp", type: "datetime", internal: 's."timestamp"' },
  {
    name: "name",
    type: "stringOptions",
    internal: 's."name"',
    options: [], // to be added at runtime
  },
  { name: "value", type: "number", internal: 's."value"' },
  { name: "userId", type: "string", internal: 't."user_id"' },
];

export type ScoreOptions = {
  name: Array<OptionsDefinition>;
};

export function scoresTableColsWithOptions(
  options?: ScoreOptions,
): ColumnDefinition[] {
  return scoresTableCols.map((col) => {
    if (col.name === "name") {
      return { ...col, options: options?.name ?? [] };
    }
    return col;
  });
}
