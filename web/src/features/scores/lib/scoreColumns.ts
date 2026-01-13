import {
  type ScoreAggregate,
  type FilterCondition,
  type ScoreDataTypeType,
  type ScoreSourceType,
} from "@langfuse/shared";

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

  // Filter for dataset run item scores via dataset_run_items_rmt
  forDatasetRunItems: ({
    datasetRunIds,
    datasetId,
  }: {
    datasetRunIds: string[];
    datasetId: string;
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetRunItemRunIds",
      operator: "any of",
      value: datasetRunIds,
    },
    {
      type: "string",
      column: "datasetId",
      operator: "=",
      value: datasetId,
    },
  ],

  // Filter for dataset item scores via dataset_run_items_rmt
  forDatasetItems: ({
    datasetItemIds,
    datasetId,
  }: {
    datasetItemIds: string[];
    datasetId: string;
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "datasetItemIds",
      operator: "any of",
      value: datasetItemIds,
    },
    {
      type: "string",
      column: "datasetId",
      operator: "=",
      value: datasetId,
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

export const getScoreDataTypeIcon = (dataType: ScoreDataTypeType): string => {
  switch (dataType) {
    case "NUMERIC":
    default:
      return "#";
    case "CATEGORICAL":
      return "Ⓒ";
    case "BOOLEAN":
      return "Ⓑ";
    case "CORRECTION":
      return "";
  }
};

// Utility function (could go in a utils file)
export const convertScoreColumnsToAnalyticsData = (
  scoreColumns:
    | {
        key: string;
        name: string;
        dataType: ScoreDataTypeType;
        source: ScoreSourceType;
      }[]
    | undefined,
) => {
  const scoreAnalyticsOptions =
    scoreColumns?.map(({ key, name, dataType, source }) => ({
      key,
      value: `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
    })) ?? [];

  return {
    scoreAnalyticsOptions,
    scoreKeyToData: new Map(scoreColumns?.map((obj) => [obj.key, obj]) ?? []),
  };
};
