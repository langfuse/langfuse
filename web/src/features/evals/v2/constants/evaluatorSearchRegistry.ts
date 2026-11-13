import {
  TopicsTargetObject,
  traceTranscriptFilterDefinition,
  validateEvaluatorFiltersForTarget,
} from "@langfuse/shared";

import { DATASET_NAME_FILTER_COLUMN } from "@/src/features/evals/v2/utils/datasetNameFilter";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  createFieldRegistry,
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

const traceTranscriptColumnIds = new Set(
  traceTranscriptFilterDefinition.columns.map((column) => column.id),
);

/** The rule filter columns and operators a trace transcript rule accepts. */
export const TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY = createFieldRegistry({
  ...RULE_FIELD_REGISTRY,
  fields: RULE_FIELD_REGISTRY.fields.filter((field) =>
    traceTranscriptColumnIds.has(field.filterColumn ?? field.id),
  ),
  columns: RULE_FIELD_REGISTRY.columns.filter((column) =>
    traceTranscriptColumnIds.has(column.id),
  ),
  searchExamples: ["traceName:support-chat", "tags:billing", "env:production"],
  aiFilterPrompt: false,
  aiContextFields: [],
  filterStateErrors: (filters) =>
    validateEvaluatorFiltersForTarget({
      targetObject: TopicsTargetObject,
      filter: filters,
    }).issues.map(({ message }) => message),
});
