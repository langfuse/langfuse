import {
  ListableScoreDataType,
  ScoreDataTypeType,
  ScoreSourceType,
} from "../../../../domain/scores";
import { MetadataDomain } from "../../../../domain/traces";

/**
 * Normalizes score names for comparison by converting - and . to _
 * "-" and "." reserved for splitting in namespace
 */
export const normalizeScoreName = (name: string): string => {
  return name.replaceAll(/[-\.]/g, "_");
};

export const composeAggregateScoreKey = ({
  name,
  source,
  dataType,
}: {
  name: string;
  source: ScoreSourceType;
  dataType: ScoreDataTypeType;
  keyPrefix?: string;
}): string => {
  const formattedName = normalizeScoreName(name);
  return `${formattedName}-${source}-${dataType}`;
};

export type BaseAggregate = {
  comment?: string | null;
  executionTraceId?: string | null;
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
  dataType: ListableScoreDataType;
  source: ScoreSourceType;
  value?: number | null;
  comment?: string | null;
  executionTraceId?: string | null;
  metadata?: MetadataDomain | null;
  stringValue?: string | null;
  timestamp: Date;
};

export type LastUserScore = ScoreSimplified & {
  traceId: string;
  observationId?: string | null;

  userId: string;
};
