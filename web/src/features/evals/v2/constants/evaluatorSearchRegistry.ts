import { DATASET_NAME_FILTER_COLUMN } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/datasetNameFilter";
import {
  EVENTS_FIELD_REGISTRY,
  extendFieldRegistryWithColumns,
} from "@/src/features/search-bar/lib/fields";

export const EVALUATOR_FIELD_REGISTRY = extendFieldRegistryWithColumns(
  EVENTS_FIELD_REGISTRY,
  [DATASET_NAME_FILTER_COLUMN],
);
