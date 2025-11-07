import type { AggregationFunction } from "../field-catalog/types";

export type MeasureConfig = {
  measure: string;
  aggregation: AggregationFunction;
  alias?: string; // Optional explicit alias
};

export type RollupConfig = {
  measures: MeasureConfig[];
  dimensions: string[];
};

export type AggregateConfig = {
  measures: MeasureConfig[];
  dimensions: string[]; // fields to group by
};

export type OrderByConfig = {
  field: string;
  direction: "asc" | "desc";
};

export type BuildResult = {
  query: string;
  params: Record<string, unknown>;
};
