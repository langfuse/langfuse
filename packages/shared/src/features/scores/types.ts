import { ScoreDataType } from "@prisma/client";
import { ScoreSourceType } from "../../server";

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
  dataType: ScoreDataType;
  source: ScoreSourceType;
  value?: number | null;
  comment?: string | null;
  stringValue?: string | null;
};

export type LastUserScore = ScoreSimplified & {
  timestamp: string;
  traceId: string;
  observationId?: string | null;

  userId: string;
};
