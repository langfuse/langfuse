import {
  AggregatableScoreDataType,
  MetadataDomain,
  ScoreSourceType,
} from "../../../../domain";

export type BaseAggregate = {
  comment?: string | null;
  id?: string | null;
  hasMetadata?: boolean | null;
  timestamp?: Date | null;
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

export type AggregatedScoreData = CategoricalAggregate | NumericAggregate;

export type ScoreAggregate = Record<string, AggregatedScoreData>;

export type ScoreSimplified = {
  id: string;
  name: string;
  dataType: AggregatableScoreDataType;
  source: ScoreSourceType;
  value?: number | null;
  comment?: string | null;
  metadata?: MetadataDomain | null;
  stringValue?: string | null;
  timestamp: Date;
};

export type LastUserScore = ScoreSimplified & {
  traceId: string;
  observationId?: string | null;

  userId: string;
};
