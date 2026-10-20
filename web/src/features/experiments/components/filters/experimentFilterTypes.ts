import { type FilterState } from "@langfuse/shared";
import { type ExperimentItemScoreFilterOptions } from "../../types/charts";

export type ExperimentFilterTarget = {
  id: string;
  label: string;
  textClassName?: string;
};

export type ExperimentFilterOptions = ExperimentItemScoreFilterOptions & {
  itemMetadata?: Record<string, string[]>;
  eventMetadata?: Record<string, string[]>;
};

export type ExperimentFilterApply = (
  filter: FilterState[number],
  index?: number,
) => void;

export type MetadataFilterColumn = "itemMetadata" | "eventMetadata";
