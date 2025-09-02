import { type ScoreAggregate, type FilterCondition } from "@langfuse/shared";

export const scoreFilters = {
  // Filter for trace level scores
  forTraces: (): FilterCondition[] => [
    {
      type: "null",
      column: "traceId",
      operator: "is not null",
      value: "",
    },
    {
      type: "null",
      column: "observationId",
      operator: "is null",
      value: "",
    },
  ],

  // Filter for session level scores
  forSessions: (): FilterCondition[] => [
    {
      type: "null",
      column: "traceId",
      operator: "is null",
      value: "",
    },
    {
      type: "null",
      column: "sessionId",
      operator: "is not null",
      value: "",
    },
  ],

  // Filter for observation level scores
  forObservations: (): FilterCondition[] => [
    {
      type: "null",
      column: "observationId",
      operator: "is not null",
      value: "",
    },
  ],

  // Filter for dataset run level scores
  forDatasetRuns: ({
    datasetRunIds,
  }: {
    datasetRunIds: string[];
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetRunIds",
      operator: "any of",
      value: datasetRunIds,
    },
  ],

  // Filter for dataset run item scores
  forDatasetRunItems: ({
    datasetRunIds,
  }: {
    datasetRunIds: string[];
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetRunItemRunIds",
      operator: "any of",
      value: datasetRunIds,
    },
  ],

  // Filter for dataset item scores via dataset_run_items_rmt
  forDatasetItems: ({
    datasetItemIds,
  }: {
    datasetItemIds: string[];
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetItemIds",
      operator: "any of",
      value: datasetItemIds,
    },
  ],
};

export const addPrefixToScoreKeys = (
  scores: ScoreAggregate,
  prefix: string,
) => {
  const prefixed: ScoreAggregate = {};
  for (const [key, value] of Object.entries(scores)) {
    prefixed[`${prefix}-${key}`] = value;
  }
  return prefixed;
};
