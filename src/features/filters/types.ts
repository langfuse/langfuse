type dtype = "string" | "number" | "datetime";

export type FilterColumn = { name: string; type: dtype };
export type FilterColumns = readonly FilterColumn[];

type ColumnNames<C extends FilterColumns> = C[number]["name"];

export const filterOperators = {
  string: ["=", "!=", "starts with", "ends with", "contains", "regex"],
  number: ["=", "!=", ">", "<"],
  datetime: [">", "<"],
} as const;

export type FilterCondition<cols extends FilterColumns = []> = {
  column: ColumnNames<cols> | null;
  operator: (typeof filterOperators)[cols[number]["type"]][number] | null;
  value: string | null;
};
export type FilterState<cols extends FilterColumns = []> =
  FilterCondition<cols>[];
