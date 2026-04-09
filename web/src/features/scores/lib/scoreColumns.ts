import {
  type ScoreAggregate,
  type FilterCondition,
  type ScoreDataTypeType,
  type ScoreSourceType,
} from "@langfuse/shared";

const traceLevelScoreFilter = (): FilterCondition[] => [
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
];

/**
 * Scope helpers for score discovery.
 *
 * - Trace-level: scores written directly to the trace. These have a `traceId`
 *   and no `observationId`.
 * - Trace-scoped: any score row attached to a trace. This includes trace-level
 *   scores plus observation-level scores whose observations belong to the
 *   trace.
 * - Aggregate: the UI groups all score rows returned for a given scope by
 *   `name/source/dataType` and renders one aggregate column per group.
 */
export const scoreFilters = {
  // Scores written directly to the trace itself.
  forTraceLevel: traceLevelScoreFilter,

  // Historical alias for trace-level semantics. Prefer `forTraceLevel`.
  forTraces: traceLevelScoreFilter,

  // Any score row that rolls up into a trace aggregate column.
  forTraceScopedAggregates: (): FilterCondition[] => [
    {
      type: "null",
      column: "traceId",
      operator: "is not null",
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

  // Filter for experiment item scores (trace-based scores via events_core)
  forExperimentItems: ({
    experimentIds,
  }: {
    experimentIds: string[];
  }): FilterCondition[] => [
    {
      type: "stringOptions",
      column: "experimentIds",
      operator: "any of",
      value: experimentIds,
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
    case "TEXT":
      return "Aa";
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
