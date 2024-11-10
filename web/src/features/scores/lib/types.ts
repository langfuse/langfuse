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
