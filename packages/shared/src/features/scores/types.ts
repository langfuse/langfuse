import { Prisma, ScoreDataType } from "@prisma/client";
import { ScoreSourceType } from "../../server";

export type BaseAggregate = {
  comment?: string | null;
  id?: string | null;
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
  // TODO: unsure if this is the optimal type here
  metadata?: Prisma.JsonValue | null;
  stringValue?: string | null;
};

export type LastUserScore = ScoreSimplified & {
  timestamp: string;
  traceId: string;
  observationId?: string | null;

  userId: string;
};
