import { type ObservationsTableRow } from "@/src/components/table/use-cases/observations";
import { type TracesTableRow } from "@/src/components/table/use-cases/traces";
import { type DatasetRunItemRowData } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { type DatasetRunRowData } from "@/src/features/datasets/components/DatasetRunsTable";
import { type PromptVersionTableRow } from "@/src/pages/project/[projectId]/prompts/[promptName]/metrics";
import { type ScoreDataType, type ScoreSourceType } from "@langfuse/shared";

export type TableRowTypesWithIndividualScoreColumns =
  | ObservationsTableRow
  | TracesTableRow
  | DatasetRunItemRowData
  | DatasetRunRowData
  | PromptVersionTableRow;

export type ScoreData = {
  key: string;
  name: string;
  dataType: ScoreDataType;
  source: ScoreSourceType;
};
