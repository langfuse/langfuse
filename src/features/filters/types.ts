export type FilterOption = { value: string; count?: number };
export type FilterColumn =
  | { name: string; type: "number" | "datetime" | "string" }
  | {
      name: string;
      type: "stringOptions";
      options: FilterOption[] | readonly FilterOption[];
    };
export type FilterColumns = readonly FilterColumn[];

type ColumnNames<C extends FilterColumns> = C[number]["name"];

export const filterOperators = {
  string: ["=", "!=", "starts with", "ends with", "contains", "regex"],
  stringOptions: [
    "any of",
    "none of",
    "starts with",
    "ends with",
    "contains",
    "regex",
  ],
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
