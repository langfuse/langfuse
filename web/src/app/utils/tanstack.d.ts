export declare module "@tanstack/table-core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    filter: SelectFilter | NumberComparisonFilter | KeyValueFilter;
  }
}

type KeyValueFilter = {
  type: "key-value";
  values: KeyValue[] | null;
  removeSelectedValue: (toBeRemoved: KeyValue) => void;
  updateFunction: (newValues: KeyValue | null) => void;
};

export type KeyValue = {
  key: string;
  value: string;
};

type SelectFilter = {
  type: "select";
  values: string[] | null;
  updateFunction: (newValues: string[] | null) => void;
};

type Operator = "gt" | "gte" | "lt" | "lte" | "equals";

type ScoreFilter = {
  name: string;
  operator: Operator;
  value: number;
};

type SelectedScoreFilter = {
  name: string | null;
  operator: Operator | null;
  value: number | null;
};

type NumberComparisonFilter = {
  type: "number-comparison";
  values: ScoreFilter | null;
  selectedValues: SelectedScoreFilter;
  updateSelectedScores: (newValues: SelectedScoreFilter) => void;
  updateFunction: (newValues: ScoreFilter | null) => void;
};
