import { type ScoreDataType, type ScoreSource } from "@langfuse/shared";
import { type GenerationsTableRow } from "@/src/components/table/use-cases/generations";
import { type TracesTableRow } from "@/src/components/table/use-cases/traces";
import { type DatasetRunItemRowData } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { type DatasetRunRowData } from "@/src/features/datasets/components/DatasetRunsTable";
import { type PromptVersionTableRow } from "@/src/pages/project/[projectId]/prompts/[promptName]/metrics";

export type TableRowTypesWithIndividualScoreColumns =
  | GenerationsTableRow
  | TracesTableRow
  | DatasetRunItemRowData
  | DatasetRunRowData
  | PromptVersionTableRow;

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
  source: ScoreSource;
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
