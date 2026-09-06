import { DATASET_NAME_FILTER_COLUMN } from "@/src/features/evals/v2/utils/datasetNameFilter";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  EVENTS_FIELD_REGISTRY,
  extendFieldRegistryWithColumns,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";

const withDatasetNameAiContext = (
  registry: FieldRegistry,
): FieldRegistry["aiContextFields"] =>
  registry.aiContextFields
    .filter(
      ({ observedOptionsKey }) => observedOptionsKey !== "experimentDatasetId",
    )
    .concat({
      observedOptionsKey: "datasetName",
      promptLabel: "datasetName",
    });

export const EVALUATOR_FIELD_REGISTRY = {
  ...extendFieldRegistryWithColumns(
    EVENTS_FIELD_REGISTRY,
    [DATASET_NAME_FILTER_COLUMN],
    { datasetName: { filterColumn: "experimentDatasetId" } },
  ),
  id: "evaluatorSamples" as const,
  aiContextFields: withDatasetNameAiContext(EVENTS_FIELD_REGISTRY),
};

export const RULE_SAMPLE_FIELD_REGISTRY = {
  ...extendFieldRegistryWithColumns(
    RULE_FIELD_REGISTRY,
    [DATASET_NAME_FILTER_COLUMN],
    { datasetName: { filterColumn: "experimentDatasetId" } },
  ),
  id: "ruleSamples" as const,
  aiContextFields: withDatasetNameAiContext(RULE_FIELD_REGISTRY),
};
