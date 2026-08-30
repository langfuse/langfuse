import { DATASET_NAME_FILTER_COLUMN } from "@/src/features/evals/v2/utils/datasetNameFilter";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  EVENTS_FIELD_REGISTRY,
  extendFieldRegistryWithColumns,
} from "@/src/features/search-bar/lib/fields";

export const EVALUATOR_FIELD_REGISTRY = {
  ...extendFieldRegistryWithColumns(EVENTS_FIELD_REGISTRY, [
    DATASET_NAME_FILTER_COLUMN,
  ]),
  aiFilterPrompt: false,
};

export const RULE_SAMPLE_FIELD_REGISTRY = {
  ...extendFieldRegistryWithColumns(RULE_FIELD_REGISTRY, [
    DATASET_NAME_FILTER_COLUMN,
  ]),
  aiFilterPrompt: false,
};
