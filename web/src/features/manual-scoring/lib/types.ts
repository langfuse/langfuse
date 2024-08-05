import { type ScoreDataType, type ScoreSource } from "@langfuse/shared";

export type CategoricalAggregate = {
  type: "CATEGORICAL";
  values: string[];
  valueCounts: { value: string; count: number }[];
  comment?: string | null;
};

export type NumericAggregate = {
  type: "NUMERIC";
  values: number[];
  average: number;
  comment?: string | null;
};

export type ScoreAggregate = Record<
  string,
  CategoricalAggregate | NumericAggregate
>;

export type ScoreSimplified = {
  name: string;
  value?: number | null;
  stringValue: string | null;
  source: ScoreSource;
  dataType: ScoreDataType;
  comment?: string | null;
};
