import { ScoreDataType } from "@prisma/client";
import { MetadataDomain, ScoreSourceType } from "../../../../domain";

export type BaseAggregate = {
  comment?: string | null;
  id?: string | null;
  hasMetadata?: boolean | null;
};

export type CategoricalAggregate = BaseAggregate & {
  type: "CATEGORICAL";
  values: string[];
  valueCounts: { value: string; count: number }[];
};

export type NumericAggregate = BaseAggregate & {
  type: "NUMERIC";
  values: number[];
  average: number;
};

export type ScoreAggregate = Record<
  string,
  CategoricalAggregate | NumericAggregate
>;

export type ScoreSimplified = {
  id: string;
  name: string;
  dataType: ScoreDataType;
  source: ScoreSourceType;
  value?: number | null;
  comment?: string | null;
  metadata?: MetadataDomain | null;
  stringValue?: string | null;
};

export type LastUserScore = ScoreSimplified & {
  timestamp: string;
  traceId: string;
  observationId?: string | null;

  userId: string;
};
