import type z from "zod/v4";
import type {
  ViewVersion,
  ViewDeclarationType,
  DimensionsDeclarationType,
  views,
} from "@/src/features/query/types";
import { InvalidRequestError } from "@langfuse/shared";

// The data model defines all available dimensions, measures, and the timeDimension for a given view.
// Make sure to update ./dashboardUiTableToViewMapping.ts if you make changes

export const traceView: ViewDeclarationType = {
  name: "traces",
  description:
    "Traces represent a group of observations and typically represent a single request or operation.",
  dimensions: {
    id: {
      sql: "traces.id",
      alias: "id",
      type: "string",
      description: "Unique identifier of the trace.",
    },
    name: {
      sql: "traces.name",
      alias: "name",
      type: "string",
      description:
        "Name assigned to the trace (often the endpoint or operation).",
    },
    tags: {
      sql: "traces.tags",
      alias: "tags",
      type: "string[]",
      description: "User-defined tags associated with the trace.",
    },
    userId: {
      sql: "traces.user_id",
      alias: "userId",
      type: "string",
      description: "Identifier of the user triggering the trace.",
    },
    sessionId: {
      sql: "traces.session_id",
      alias: "sessionId",
      type: "string",
      description: "Identifier of the session triggering the trace.",
    },
    release: {
      sql: "traces.release",
      alias: "release",
      type: "string",
      description: "Release version of the trace.",
    },
    version: {
      sql: "traces.version",
      alias: "version",
      type: "string",
      description: "Version of the trace.",
    },
    environment: {
      sql: "traces.environment",
      alias: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
    },
    timestampMonth: {
      sql: "DATE_FORMAT(traces.timestamp, '%Y-%m')",
      alias: "timestampMonth",
      type: "string",
      description: "Month of the trace timestamp in YYYY-MM format.",
    },
  },
  measures: {
    count: {
      sql: "COUNT(*)",
      alias: "count",
      type: "integer",
      description: "Total number of traces.",
      unit: "traces",
    },
    observationsCount: {
      sql: "COUNT(DISTINCT observations.id)",
      alias: "observationsCount",
      type: "integer",
      relationTable: "observations",
      description: "Unique observations linked to the trace.",
      unit: "observations",
    },
    scoresCount: {
      sql: "COUNT(DISTINCT scores.id)",
      alias: "scoresCount",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the trace.",
      unit: "scores",
    },
    uniqueUserIds: {
      sql: "COUNT(DISTINCT traces.user_id)",
      alias: "uniqueUserIds",
      type: "integer",
      description: "Count of unique userIds.",
      unit: "users",
    },
    uniqueSessionIds: {
      sql: "COUNT(DISTINCT traces.session_id)",
      alias: "uniqueSessionIds",
      type: "integer",
      description: "Count of unique sessionIds.",
      unit: "sessions",
    },
    latency: {
      sql: "TIMESTAMPDIFF(MICROSECOND, MIN(observations.start_time), MAX(COALESCE(observations.end_time, observations.start_time))) / 1000",
      alias: "latency",
      type: "integer",
      relationTable: "observations",
      description:
        "Elapsed time between the first and last observation inside the trace.",
      unit: "millisecond",
    },
    totalTokens: {
      sql: "SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(observations.usage_details, '$.total')) AS UNSIGNED), 0))",
      alias: "totalTokens",
      type: "integer",
      relationTable: "observations",
      description: "Sum of tokens consumed by all observations in the trace.",
      unit: "tokens",
    },
    totalCost: {
      sql: "SUM(observations.total_cost)",
      alias: "totalCost",
      type: "decimal",
      relationTable: "observations",
      description: "Total cost accumulated across observations in the trace.",
      unit: "USD",
    },
  },
  tableRelations: {
    observations: {
      name: "observations",
      joinConditionSql:
        "ON traces.id = observations.trace_id AND traces.project_id = observations.project_id",
      timeDimension: "start_time",
    },
    scores: {
      name: "scores",
      joinConditionSql:
        "ON traces.id = scores.trace_id AND traces.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  segments: [],
  timeDimension: "timestamp",
  baseCte: "traces",
};

export const eventsTracesView: ViewDeclarationType = {
  name: "events_traces",
  description:
    "Traces built from events table aggregation - mirrors v1 traces view with 100% API compatibility.",
  dimensions: {
    id: {
      sql: "events_traces.trace_id",
      alias: "id",
      type: "string",
      description: "Unique identifier of the trace.",
      highCardinality: true,
      // This is the GROUP BY identity column
    },
    name: {
      sql: "NULLIF(events_traces.trace_name, '')",
      alias: "name",
      type: "string",
      description:
        "Name assigned to the trace (often the endpoint or operation).",
      aggregationFunction:
        "SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN events_traces.trace_name <> '' AND events_traces.trace_name IS NOT NULL THEN events_traces.trace_name END ORDER BY events_traces.event_ts DESC SEPARATOR '\\0'), '\\0', 1)",
    },
    tags: {
      sql: "events_traces.tags",
      alias: "tags",
      type: "string[]",
      description: "User-defined tags associated with the trace.",
      aggregationFunction: "GROUP_CONCAT(events_traces.tags)",
    },
    userId: {
      sql: "NULLIF(events_traces.user_id, '')",
      alias: "userId",
      type: "string",
      description: "Identifier of the user triggering the trace.",
      aggregationFunction:
        "SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN events_traces.user_id <> '' AND events_traces.user_id IS NOT NULL THEN events_traces.user_id END ORDER BY events_traces.event_ts DESC SEPARATOR '\\0'), '\\0', 1)",
      highCardinality: true,
    },
    sessionId: {
      sql: "NULLIF(events_traces.session_id, '')",
      alias: "sessionId",
      type: "string",
      description: "Identifier of the session triggering the trace.",
      aggregationFunction:
        "SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN events_traces.session_id <> '' AND events_traces.session_id IS NOT NULL THEN events_traces.session_id END ORDER BY events_traces.event_ts DESC SEPARATOR '\\0'), '\\0', 1)",
      highCardinality: true,
    },
    release: {
      sql: "NULLIF(events_traces.release, '')",
      alias: "release",
      type: "string",
      description: "Release version of the trace.",
      aggregationFunction:
        "SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN events_traces.release <> '' AND events_traces.release IS NOT NULL THEN events_traces.release END ORDER BY events_traces.event_ts DESC SEPARATOR '\\0'), '\\0', 1)",
    },
    version: {
      sql: "NULLIF(events_traces.version, '')",
      alias: "version",
      type: "string",
      description: "Version of the trace.",
      aggregationFunction:
        "SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN events_traces.version <> '' AND events_traces.version IS NOT NULL THEN events_traces.version END ORDER BY events_traces.event_ts DESC SEPARATOR '\\0'), '\\0', 1)",
    },
    environment: {
      sql: "NULLIF(events_traces.environment, '')",
      alias: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
      aggregationFunction:
        "SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN events_traces.environment <> '' AND events_traces.environment IS NOT NULL THEN events_traces.environment END ORDER BY events_traces.event_ts DESC SEPARATOR '\\0'), '\\0', 1)",
    },
    timestampMonth: {
      sql: "events_traces.start_time",
      alias: "timestampMonth",
      type: "string",
      description: "Month of the trace timestamp in YYYY-MM format.",
      aggregationFunction:
        "DATE_FORMAT(MIN(events_traces.start_time), '%Y-%m')",
    },
  },
  measures: {
    count: {
      sql: "COUNT(*)",
      alias: "count",
      type: "integer",
      description: "Total number of traces.",
      unit: "traces",
    },
    observationsCount: {
      sql: "COUNT(DISTINCT events_traces.span_id)",
      alias: "observationsCount",
      type: "integer",
      description: "Unique observations linked to the trace.",
      unit: "observations",
    },
    scoresCount: {
      sql: "COUNT(DISTINCT scores.id)",
      alias: "scoresCount",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the trace.",
      unit: "scores",
    },
    uniqueUserIds: {
      sql: "COUNT(DISTINCT events_traces.user_id)",
      alias: "uniqueUserIds",
      type: "integer",
      description: "Count of unique userIds.",
      unit: "users",
    },
    uniqueSessionIds: {
      sql: "COUNT(DISTINCT events_traces.session_id)",
      alias: "uniqueSessionIds",
      type: "integer",
      description: "Count of unique sessionIds.",
      unit: "sessions",
    },
    latency: {
      sql: "TIMESTAMPDIFF(MICROSECOND, MIN(events_traces.start_time), MAX(COALESCE(events_traces.end_time, events_traces.start_time))) / 1000",
      alias: "latency",
      type: "integer",
      description:
        "Elapsed time between the first and last observation inside the trace.",
      unit: "millisecond",
    },
    totalTokens: {
      sql: "SUM(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(events_traces.usage_details, '$.total')) AS UNSIGNED), 0))",
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by all observations in the trace.",
      unit: "tokens",
    },
    totalCost: {
      sql: "SUM(events_traces.total_cost)",
      alias: "totalCost",
      type: "decimal",
      description: "Total cost accumulated across observations in the trace.",
      unit: "USD",
    },
  },
  tableRelations: {
    scores: {
      name: "scores",
      joinConditionSql:
        "ON events_traces.trace_id = scores.trace_id AND events_traces.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  segments: [],
  timeDimension: "start_time",
  baseCte: "events events_traces",
};

export const observationsView: ViewDeclarationType = {
  name: "observations",
  description:
    "Observations represent individual requests or operations within a trace. They are grouped into Spans, Generations, and Events.",
  dimensions: {
    id: {
      sql: "observations.id",
      alias: "id",
      type: "string",
      description: "Unique identifier for the observation.",
    },
    traceId: {
      sql: "observations.trace_id",
      alias: "traceId",
      type: "string",
      description: "Identifier linking the observation to its parent trace.",
    },
    traceName: {
      sql: "traces.name",
      alias: "traceName",
      type: "string",
      relationTable: "traces",
      description: "Name of the parent trace.",
    },
    environment: {
      sql: "observations.environment",
      alias: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
    },
    parentObservationId: {
      sql: "observations.parent_observation_id",
      alias: "parentObservationId",
      type: "string",
      description:
        "Identifier of the parent observation. Empty for the root span.",
    },
    type: {
      sql: "observations.type",
      alias: "type",
      type: "string",
      description:
        "Type of the observation. Can be a SPAN, GENERATION, or EVENT.",
    },
    name: {
      sql: "observations.name",
      alias: "name",
      type: "string",
      description: "Name of the observation.",
    },
    level: {
      sql: "observations.level",
      alias: "level",
      type: "string",
      description: "Logging level of the observation.",
    },
    version: {
      sql: "observations.version",
      alias: "version",
      type: "string",
      description: "Version of the observation.",
    },
    tags: {
      sql: "traces.tags",
      alias: "tags",
      type: "string[]",
      relationTable: "traces",
      description: "User-defined tags associated with the trace.",
    },
    providedModelName: {
      sql: "observations.provided_model_name",
      alias: "providedModelName",
      type: "string",
      description: "Name of the model used for the observation.",
    },
    promptName: {
      sql: "observations.prompt_name",
      alias: "promptName",
      type: "string",
      description: "Name of the prompt used for the observation.",
    },
    promptVersion: {
      sql: "observations.prompt_version",
      alias: "promptVersion",
      type: "string",
      description: "Version of the prompt used for the observation.",
    },
    userId: {
      sql: "traces.user_id",
      alias: "userId",
      type: "string",
      relationTable: "traces",
      description: "Identifier of the user triggering the observation.",
    },
    sessionId: {
      sql: "traces.session_id",
      alias: "sessionId",
      type: "string",
      relationTable: "traces",
      description: "Identifier of the session triggering the observation.",
    },
    traceRelease: {
      sql: "traces.release",
      alias: "traceRelease",
      type: "string",
      relationTable: "traces",
      description: "Release version of the parent trace.",
    },
    traceVersion: {
      sql: "traces.version",
      alias: "traceVersion",
      type: "string",
      relationTable: "traces",
      description: "Version of the parent trace.",
    },
    startTimeMonth: {
      sql: "DATE_FORMAT(observations.start_time, '%Y-%m')",
      alias: "startTimeMonth",
      type: "string",
      description: "Month of the observation start_time in YYYY-MM format.",
    },
    toolNames: {
      sql: "JSON_KEYS(observations.tool_definitions)",
      alias: "toolNames",
      type: "arrayString",
      description: "Names of available tools defined for the observation.",
      explodeArray: true,
    },
    calledToolNames: {
      sql: "observations.tool_call_names",
      alias: "calledToolNames",
      type: "arrayString",
      description: "Names of tools that were called by the observation.",
      explodeArray: true,
    },
  },
  measures: {
    count: {
      sql: "@@AGG@@(1)",
      aggs: { agg: "count" },
      alias: "count",
      type: "integer",
      description: "Total number of observations.",
      unit: "observations",
    },
    latency: {
      sql: "TIMESTAMPDIFF(MICROSECOND, @@AGG1@@(observations.start_time), @@AGG1@@(COALESCE(observations.end_time, observations.start_time))) / 1000",
      aggs: { agg1: "MAX" },
      alias: "latency",
      type: "integer",
      description:
        "Latency of an individual observation (start time to end time).",
      unit: "millisecond",
    },
    streamingLatency: {
      sql: "IF(@@AGG1@@(observations.completion_start_time) IS NULL, NULL, TIMESTAMPDIFF(MICROSECOND, @@AGG1@@(observations.completion_start_time), @@AGG1@@(observations.end_time)) / 1000)",
      aggs: { agg1: "MAX" },
      alias: "streamingLatency",
      type: "integer",
      description:
        "Latency of the generation step (completion start time to end time).",
      unit: "millisecond",
    },
    inputTokens: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.input')) AS UNSIGNED), 0)",
      aggs: { agg1: "MAX" },
      alias: "inputTokens",
      type: "integer",
      description: "Sum of input tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokens: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.output')) AS UNSIGNED), 0)",
      aggs: { agg1: "MAX" },
      alias: "outputTokens",
      type: "integer",
      description: "Sum of output tokens produced by the observation.",
      unit: "tokens",
    },
    totalTokens: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.total')) AS UNSIGNED), 0)",
      aggs: { agg1: "MAX" },
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokensPerSecond: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.output')) AS UNSIGNED), 0) / NULLIF(TIMESTAMPDIFF(SECOND, @@AGG1@@(observations.completion_start_time), @@AGG1@@(observations.end_time)), 0)",
      aggs: { agg1: "MAX" },
      alias: "outputTokensPerSecond",
      type: "decimal",
      description:
        "Average number of output tokens produced per second between completion start time and span end time.",
      unit: "tokens/s",
    },
    tokensPerSecond: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.total')) AS UNSIGNED), 0) / NULLIF(TIMESTAMPDIFF(SECOND, @@AGG2@@(observations.start_time), @@AGG2@@(observations.end_time)), 0)",
      aggs: { agg1: "MAX", agg2: "MAX" },
      alias: "tokensPerSecond",
      type: "decimal",
      description:
        "Average number of tokens consumed per second by the observation.",
      unit: "tokens/s",
    },
    inputCost: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(cost_details), '$.input')) AS DECIMAL(10,4)), 0)",
      aggs: { agg1: "MAX" },
      alias: "inputCost",
      type: "decimal",
      description: "Sum of input cost incurred by the observation.",
      unit: "USD",
    },
    outputCost: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(cost_details), '$.output')) AS DECIMAL(10,4)), 0)",
      aggs: { agg1: "MAX" },
      alias: "outputCost",
      type: "decimal",
      description: "Sum of output cost incurred by the observation.",
      unit: "USD",
    },
    totalCost: {
      sql: "@@AGG1@@(total_cost)",
      aggs: { agg1: "sum" },
      alias: "totalCost",
      type: "decimal",
      description: "Total cost incurred by the observation.",
      unit: "USD",
    },
    timeToFirstToken: {
      sql: "IF(@@AGG1@@(observations.completion_start_time) IS NULL, NULL, TIMESTAMPDIFF(MICROSECOND, @@AGG1@@(observations.start_time), @@AGG1@@(observations.completion_start_time)) / 1000)",
      aggs: { agg1: "MAX" },
      alias: "timeToFirstToken",
      type: "integer",
      description: "Time to first token for the observation.",
      unit: "millisecond",
    },
    countScores: {
      sql: "COUNT(DISTINCT scores.id)",
      alias: "countScores",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the observation.",
      unit: "scores",
    },
    toolDefinitions: {
      sql: "NULLIF(JSON_LENGTH(JSON_KEYS(@@AGG1@@(tool_definitions))), 0)",
      aggs: { agg1: "MAX" },
      alias: "toolDefinitions",
      type: "integer",
      description: "Number of available tools per observation.",
      unit: "tools",
    },
    toolCalls: {
      sql: "NULLIF(JSON_LENGTH(@@AGG1@@(tool_calls)), 0)",
      aggs: { agg1: "MAX" },
      alias: "toolCalls",
      type: "integer",
      description: "Number of tool calls per observation.",
      unit: "calls",
    },
  },
  tableRelations: {
    traces: {
      name: "traces",
      joinConditionSql:
        "ON observations.trace_id = traces.id AND observations.project_id = traces.project_id",
      timeDimension: "timestamp",
    },
    scores: {
      name: "scores",
      joinConditionSql:
        "ON observations.id = scores.observation_id AND observations.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  segments: [],
  timeDimension: "start_time",
  baseCte: "observations",
};

const scoreBaseDimensions: DimensionsDeclarationType = {
  traceName: {
    sql: "traces.name",
    alias: "traceName",
    type: "string",
    relationTable: "traces",
    description: "Name of the parent trace.",
  },
  tags: {
    sql: "traces.tags",
    alias: "tags",
    type: "string[]",
    relationTable: "traces",
    description: "User-defined tags associated with the trace.",
  },
  userId: {
    sql: "traces.user_id",
    alias: "userId",
    type: "string",
    relationTable: "traces",
    description: "Identifier of the user triggering the trace.",
  },
  sessionId: {
    sql: "traces.session_id",
    alias: "sessionId",
    type: "string",
    relationTable: "traces",
    description: "Identifier of the session triggering the trace.",
  },
  traceRelease: {
    sql: "traces.release",
    alias: "traceRelease",
    type: "string",
    relationTable: "traces",
    description: "Release version of the parent trace.",
  },
  traceVersion: {
    sql: "traces.version",
    alias: "traceVersion",
    type: "string",
    relationTable: "traces",
    description: "Version of the parent trace.",
  },
  observationName: {
    sql: "observations.name",
    alias: "observationName",
    type: "string",
    relationTable: "observations",
    description: "Name of the observation associated with the score.",
  },
  observationModelName: {
    sql: "observations.provided_model_name",
    alias: "observationModelName",
    type: "string",
    relationTable: "observations",
    description: "Name of the model used for the observation.",
  },
  observationPromptName: {
    sql: "observations.prompt_name",
    alias: "observationPromptName",
    type: "string",
    relationTable: "observations",
    description: "Name of the prompt used for the observation.",
  },
  observationPromptVersion: {
    sql: "observations.prompt_version",
    alias: "observationPromptVersion",
    type: "string",
    relationTable: "observations",
    description: "Version of the prompt used for the observation.",
  },
};

// v2 scores dimensions
const scoresV2BaseDimensions: DimensionsDeclarationType = {
  sessionId: {
    sql: "scores.session_id",
    alias: "sessionId",
    type: "string",
    description: "Identifier of the session.",
    highCardinality: true,
  },
  // Trace metadata on events table (accessed via events_traces JOIN)
  traceName: {
    sql: "nullIf(events_traces.trace_name, '')",
    alias: "traceName",
    type: "string",
    relationTable: "events_traces",
    description: "Name of the parent trace.",
  },
  userId: {
    sql: "nullIf(events_traces.user_id, '')",
    alias: "userId",
    type: "string",
    relationTable: "events_traces",
    description: "Identifier of the user.",
    highCardinality: true,
  },
  tags: {
    sql: "events_traces.tags",
    alias: "tags",
    type: "string[]",
    relationTable: "events_traces",
    description: "User-defined tags.",
  },
  traceRelease: {
    sql: "nullIf(events_traces.release, '')",
    alias: "traceRelease",
    type: "string",
    relationTable: "events_traces",
    description: "Release version.",
  },
  traceVersion: {
    sql: "nullIf(events_traces.version, '')",
    alias: "traceVersion",
    type: "string",
    relationTable: "events_traces",
    description: "Version of the parent trace.",
  },
  // Observation fields from events table (accessed via events_observations JOIN)
  observationName: {
    sql: "events_observations.name",
    alias: "observationName",
    type: "string",
    relationTable: "events_observations",
    description: "Name of the observation associated with the score.",
  },
  observationModelName: {
    sql: "nullIf(events_observations.provided_model_name, '')",
    alias: "observationModelName",
    type: "string",
    relationTable: "events_observations",
    description: "Name of the model used for the observation.",
  },
  observationPromptName: {
    sql: "nullIf(events_observations.prompt_name, '')",
    alias: "observationPromptName",
    type: "string",
    relationTable: "events_observations",
    description: "Name of the prompt used for the observation.",
  },
  observationPromptVersion: {
    sql: "events_observations.prompt_version",
    alias: "observationPromptVersion",
    type: "string",
    relationTable: "events_observations",
    description: "Version of the prompt used for the observation.",
  },
};

// Factory for shared score-specific dimensions (both numeric and categorical)
const createScoreSpecificDimensions = (
  tableAlias: string,
  isV2: boolean = false,
): DimensionsDeclarationType => ({
  id: {
    sql: `${tableAlias}.id`,
    alias: "id",
    type: "string",
    description: "Unique identifier of the score entry.",
    ...(isV2 && { highCardinality: true }),
  },
  environment: {
    sql: `${tableAlias}.environment`,
    alias: "environment",
    type: "string",
    description: "Deployment environment (e.g., production, staging).",
  },
  name: {
    sql: `${tableAlias}.name`,
    alias: "name",
    type: "string",
    description: "Name of the score (e.g., accuracy, toxicity).",
  },
  source: {
    sql: `${tableAlias}.source`,
    alias: "source",
    type: "string",
    description: "Origin of the score. Can be API, ANNOTATION, or EVAL.",
  },
  dataType: {
    sql: `${tableAlias}.data_type`,
    alias: "dataType",
    type: "string",
    description:
      "Internal data type of the score (NUMERIC, BOOLEAN, CATEGORICAL).",
  },
  traceId: {
    sql: `${tableAlias}.trace_id`,
    alias: "traceId",
    type: "string",
    description: "Identifier of the parent trace.",
    ...(isV2 && { highCardinality: true }),
  },
  configId: {
    sql: `${tableAlias}.config_id`,
    alias: "configId",
    type: "string",
    description: "Identifier of the config associated with the score.",
  },
  timestampMonth: {
    sql: `DATE_FORMAT(${tableAlias}.timestamp, '%Y-%m')`,
    alias: "timestampMonth",
    type: "string",
    description: "Month of the score timestamp in YYYY-MM format.",
  },
  timestampDay: {
    sql: `DATE_FORMAT(${tableAlias}.timestamp, '%Y-%m-%d')`,
    alias: "timestampDay",
    type: "string",
    description: "Day of the score timestamp in YYYY-MM-DD format.",
  },
  observationId: {
    sql: `${tableAlias}.observation_id`,
    alias: "observationId",
    type: "string",
    description: "Identifier of the observation associated with the score.",
    ...(isV2 && { highCardinality: true }),
  },
});

// Shared table relations factory. scoresTableAlias must match the alias in baseCte (e.g. "scores_numeric" or "scores_categorical").
const createScoreTableRelations = (
  version: "v1" | "v2",
  scoresTableAlias: string,
): Record<
  string,
  { name: string; joinConditionSql: string; timeDimension: string }
> => {
  if (version === "v1") {
    return {
      traces: {
        name: "traces",
        joinConditionSql: `ON ${scoresTableAlias}.trace_id = traces.id AND ${scoresTableAlias}.project_id = traces.project_id`,
        timeDimension: "timestamp",
      },
      observations: {
        name: "observations",
        joinConditionSql: `ON ${scoresTableAlias}.observation_id = observations.id AND ${scoresTableAlias}.project_id = observations.project_id`,
        timeDimension: "start_time",
      },
    };
  } else {
    return {
      events_traces: {
        name: "events",
        joinConditionSql: `ON ${scoresTableAlias}.trace_id = events_traces.trace_id AND ${scoresTableAlias}.project_id = events_traces.project_id AND events_traces.parent_span_id = ''`,
        timeDimension: "start_time",
      },
      events_observations: {
        name: "events",
        joinConditionSql: `ON ${scoresTableAlias}.project_id = events_observations.project_id AND ${scoresTableAlias}.trace_id = events_observations.trace_id AND ${scoresTableAlias}.observation_id = events_observations.span_id`,
        timeDimension: "start_time",
      },
    };
  }
};

function scoresNumericViewBase(version: "v1" | "v2"): ViewDeclarationType {
  const baseDimensions =
    version === "v1" ? scoreBaseDimensions : scoresV2BaseDimensions;
  return {
    name: "scores_numeric",
    description:
      "Scores are flexible objects that are used for evaluations. This view contains numeric and boolean scores.",
    dimensions: {
      ...baseDimensions, // v1 keeps trace-JOIN dimensions
      ...createScoreSpecificDimensions("scores_numeric", version === "v2"),
      value: {
        sql: "scores_numeric.value",
        alias: "value",
        type: "number",
        description: "Value of the score.",
      },
    },
    measures: {
      count: {
        sql: "COUNT(*)",
        alias: "count",
        type: "integer",
        description: "Total number of scores.",
        unit: "scores",
      },
      value: {
        sql: "MAX(value)",
        alias: "value",
        type: "number",
        description: "Value of the score.",
      },
    },
    tableRelations: createScoreTableRelations(version, "scores_numeric"),
    segments: [
      {
        column: "data_type",
        operator: "does not contain" as const,
        value: "CATEGORICAL",
        type: "string" as const,
      },
    ],
    timeDimension: "timestamp",
    baseCte: "scores scores_numeric",
  };
}

function scoresCategoricalViewBase(version: "v1" | "v2"): ViewDeclarationType {
  const baseDimensions =
    version === "v1" ? scoreBaseDimensions : scoresV2BaseDimensions;
  return {
    name: "scores_categorical",
    description:
      "Scores are flexible objects that are used for evaluations. This view contains categorical scores.",
    dimensions: {
      ...baseDimensions,
      ...createScoreSpecificDimensions("scores_categorical", version === "v2"),
      stringValue: {
        sql: "string_value",
        alias: "stringValue",
        type: "string",
        description: "Value of the score.",
      },
    },
    measures: {
      count: {
        sql: "COUNT(*)",
        alias: "count",
        type: "integer",
        description: "Total number of scores.",
        unit: "scores",
      },
    },
    tableRelations: createScoreTableRelations(version, "scores_categorical"),
    segments: [
      {
        column: "data_type",
        operator: "=" as const,
        value: "CATEGORICAL",
        type: "string" as const,
      },
    ],
    timeDimension: "timestamp",
    baseCte: "scores scores_categorical",
  };
}

export const scoresNumericView: ViewDeclarationType =
  scoresNumericViewBase("v1");

export const scoresCategoricalView: ViewDeclarationType =
  scoresCategoricalViewBase("v1");

// v2 Scores Views
export const scoresNumericViewV2: ViewDeclarationType =
  scoresNumericViewBase("v2");

export const scoresCategoricalViewV2: ViewDeclarationType =
  scoresCategoricalViewBase("v2");

// Events-Observations View - queries from events table instead of observations table
export const eventsObservationsView: ViewDeclarationType = {
  name: "events_observations",
  description:
    "Observations represent individual requests or operations within a trace. They are grouped into Spans, Generations, and Events.",
  dimensions: {
    id: {
      sql: "events_observations.span_id",
      alias: "id",
      type: "string",
      description: "Unique identifier for the observation.",
      highCardinality: true,
    },
    traceId: {
      sql: "events_observations.trace_id",
      alias: "traceId",
      type: "string",
      description: "Identifier linking the observation to its parent trace.",
      highCardinality: true,
    },
    environment: {
      sql: "nullIf(events_observations.environment, '')",
      alias: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
    },
    parentObservationId: {
      sql: "nullIf(events_observations.parent_span_id, '')",
      alias: "parentObservationId",
      type: "string",
      description:
        "Identifier of the parent observation. Empty for the root span.",
      highCardinality: true,
    },
    type: {
      sql: "events_observations.type",
      alias: "type",
      type: "string",
      description:
        "Type of the observation. Can be a SPAN, GENERATION, or EVENT.",
    },
    name: {
      sql: "events_observations.name",
      alias: "name",
      type: "string",
      description: "Name of the observation.",
    },
    level: {
      sql: "events_observations.level",
      alias: "level",
      type: "string",
      description: "Logging level of the observation.",
    },
    version: {
      sql: "nullIf(events_observations.version, '')",
      alias: "version",
      type: "string",
      description: "Version of the observation.",
    },
    // Denormalized trace fields from events table
    userId: {
      sql: "nullIf(events_observations.user_id, '')",
      alias: "userId",
      type: "string",
      description: "Identifier of the user triggering the observation.",
      highCardinality: true,
    },
    sessionId: {
      sql: "nullIf(events_observations.session_id, '')",
      alias: "sessionId",
      type: "string",
      description: "Identifier of the session triggering the observation.",
      highCardinality: true,
    },
    tags: {
      sql: "events_observations.tags",
      alias: "tags",
      type: "string[]",
      description: "User-defined tags associated with the trace.",
    },
    release: {
      sql: "nullIf(events_observations.release, '')",
      alias: "release",
      type: "string",
      description: "Release version.",
    },
    // Backwards-compatible field definitions (for API parity with v1)
    traceName: {
      sql: "nullIf(events_observations.trace_name, '')",
      alias: "traceName",
      type: "string",
      description: "Name of the parent trace (backwards-compatible with v1).",
    },
    traceRelease: {
      sql: "nullIf(events_observations.release, '')",
      alias: "traceRelease",
      type: "string",
      description:
        "Release version of the parent trace (backwards-compatible with v1, maps to denormalized release field).",
    },
    traceVersion: {
      sql: "nullIf(events_observations.version, '')",
      alias: "traceVersion",
      type: "string",
      description:
        "Version of the parent trace (backwards-compatible with v1, maps to denormalized version field).",
    },
    providedModelName: {
      sql: "nullIf(events_observations.provided_model_name, '')",
      alias: "providedModelName",
      type: "string",
      description: "Name of the model used for the observation.",
    },
    promptName: {
      sql: "nullIf(events_observations.prompt_name, '')",
      alias: "promptName",
      type: "string",
      description: "Name of the prompt used for the observation.",
    },
    promptVersion: {
      sql: "events_observations.prompt_version",
      alias: "promptVersion",
      type: "string",
      description: "Version of the prompt used for the observation.",
    },
    startTimeMonth: {
      sql: "DATE_FORMAT(events_observations.start_time, '%Y-%m')",
      alias: "startTimeMonth",
      type: "string",
      description: "Month of the observation start_time in YYYY-MM format.",
    },
    toolNames: {
      sql: "JSON_KEYS(events_observations.tool_definitions)",
      alias: "toolNames",
      type: "arrayString",
      description: "Names of available tools defined for the observation.",
      explodeArray: true,
    },
    calledToolNames: {
      sql: "events_observations.tool_call_names",
      alias: "calledToolNames",
      type: "arrayString",
      description: "Names of tools that were called by the observation.",
      explodeArray: true,
    },
  },
  measures: {
    count: {
      sql: "@@AGG@@(1)",
      aggs: { agg: "count" },
      alias: "count",
      type: "integer",
      description: "Total number of observations.",
      unit: "observations",
    },
    latency: {
      sql: "TIMESTAMPDIFF(MICROSECOND, @@AGG1@@(events_observations.start_time), @@AGG1@@(events_observations.end_time)) / 1000",
      aggs: { agg1: "MAX" },
      alias: "latency",
      type: "integer",
      description:
        "Latency of an individual observation (start time to end time).",
      unit: "millisecond",
    },
    streamingLatency: {
      sql: "IF(@@AGG1@@(events_observations.completion_start_time) IS NULL, NULL, TIMESTAMPDIFF(MICROSECOND, @@AGG1@@(events_observations.completion_start_time), @@AGG1@@(events_observations.end_time)) / 1000)",
      aggs: { agg1: "MAX" },
      alias: "streamingLatency",
      type: "integer",
      description:
        "Latency of the generation step (completion start time to end time).",
      unit: "millisecond",
    },
    inputTokens: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.input')) AS UNSIGNED), 0)",
      aggs: { agg1: "MAX" },
      alias: "inputTokens",
      type: "integer",
      description: "Sum of input tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokens: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.output')) AS UNSIGNED), 0)",
      aggs: { agg1: "MAX" },
      alias: "outputTokens",
      type: "integer",
      description: "Sum of output tokens produced by the observation.",
      unit: "tokens",
    },
    totalTokens: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.total')) AS UNSIGNED), 0)",
      aggs: { agg1: "MAX" },
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokensPerSecond: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.output')) AS UNSIGNED), 0) / NULLIF(TIMESTAMPDIFF(SECOND, @@AGG1@@(events_observations.completion_start_time), @@AGG1@@(events_observations.end_time)), 0)",
      aggs: { agg1: "MAX" },
      alias: "outputTokensPerSecond",
      type: "decimal",
      description:
        "Average number of output tokens produced per second between completion start time and span end time.",
      unit: "tokens/s",
    },
    tokensPerSecond: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(usage_details), '$.total')) AS UNSIGNED), 0) / NULLIF(TIMESTAMPDIFF(SECOND, @@AGG2@@(events_observations.start_time), @@AGG2@@(events_observations.end_time)), 0)",
      aggs: { agg1: "MAX", agg2: "MAX" },
      alias: "tokensPerSecond",
      type: "decimal",
      description:
        "Average number of tokens consumed per second by the observation.",
      unit: "tokens/s",
    },
    inputCost: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(cost_details), '$.input')) AS DECIMAL(10,4)), 0)",
      aggs: { agg1: "MAX" },
      alias: "inputCost",
      type: "decimal",
      description: "Sum of input cost incurred by the observation.",
      unit: "USD",
    },
    outputCost: {
      sql: "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(@@AGG1@@(cost_details), '$.output')) AS DECIMAL(10,4)), 0)",
      aggs: { agg1: "MAX" },
      alias: "outputCost",
      type: "decimal",
      description: "Sum of output cost incurred by the observation.",
      unit: "USD",
    },
    totalCost: {
      sql: "@@AGG1@@(total_cost)",
      aggs: { agg1: "sum" },
      alias: "totalCost",
      type: "decimal",
      description: "Total cost incurred by the observation.",
      unit: "USD",
    },
    timeToFirstToken: {
      sql: "IF(@@AGG1@@(events_observations.completion_start_time) IS NULL, NULL, TIMESTAMPDIFF(MICROSECOND, @@AGG1@@(events_observations.start_time), @@AGG1@@(events_observations.completion_start_time)) / 1000)",
      aggs: { agg1: "MAX" },
      alias: "timeToFirstToken",
      type: "integer",
      description: "Time to first token for the observation.",
      unit: "millisecond",
    },
    countScores: {
      sql: "COUNT(DISTINCT scores.id)",
      alias: "countScores",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the observation.",
      unit: "scores",
    },
    toolDefinitions: {
      sql: "NULLIF(JSON_LENGTH(JSON_KEYS(@@AGG1@@(events_observations.tool_definitions))), 0)",
      aggs: { agg1: "MAX" },
      alias: "toolDefinitions",
      type: "integer",
      description: "Number of available tools per observation.",
      unit: "tools",
    },
    toolCalls: {
      sql: "NULLIF(JSON_LENGTH(@@AGG1@@(events_observations.tool_calls)), 0)",
      aggs: { agg1: "MAX" },
      alias: "toolCalls",
      type: "integer",
      description: "Number of tool calls per observation.",
      unit: "calls",
    },
  },
  tableRelations: {
    scores: {
      name: "scores",
      joinConditionSql:
        "ON events_observations.span_id = scores.observation_id AND events_observations.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  segments: [],
  timeDimension: "start_time",
  baseCte: "events events_observations",
};

// Define versioned structure type
// Both v1 and v2 have all views (traces, observations, scores-numeric, scores-categorical)
// v1 uses normalized tables (traces, observations), v2 uses events table
type VersionedViewDeclarations = {
  readonly [version in ViewVersion]: {
    readonly [K in z.infer<typeof views>]: ViewDeclarationType;
  };
};

// Versioned view declarations
export const viewDeclarations: VersionedViewDeclarations = {
  v1: {
    traces: traceView,
    observations: observationsView, // Old: observations table
    "scores-numeric": scoresNumericView,
    "scores-categorical": scoresCategoricalView,
  },
  v2: {
    traces: eventsTracesView,
    observations: eventsObservationsView,
    "scores-numeric": scoresNumericViewV2,
    "scores-categorical": scoresCategoricalViewV2,
  },
} as const;

// Helper function for view resolution
export function getViewDeclaration(
  viewName: z.infer<typeof views>,
  version: ViewVersion = "v1",
): ViewDeclarationType {
  const versionViews = viewDeclarations[version];

  // TypeScript knows the exact shape of each version now
  if (!(viewName in versionViews)) {
    const supportedViews = Object.keys(versionViews).join(", ");
    throw new InvalidRequestError(
      `View '${viewName}' is not supported in version '${version}'. ` +
        `Supported views for ${version}: ${supportedViews}`,
    );
  }

  return versionViews[viewName as keyof typeof versionViews];
}
