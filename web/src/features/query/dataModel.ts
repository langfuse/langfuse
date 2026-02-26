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
      sql: "formatDateTime(traces.timestamp, '%Y-%m')",
      alias: "timestampMonth",
      type: "string",
      description: "Month of the trace timestamp in YYYY-MM format.",
    },
  },
  measures: {
    count: {
      sql: "count(*)",
      alias: "count",
      type: "integer",
      description: "Total number of traces.",
      unit: "traces",
    },
    observationsCount: {
      sql: "uniq(observations.id)",
      alias: "observationsCount",
      type: "integer",
      relationTable: "observations",
      description: "Unique observations linked to the trace.",
      unit: "observations",
    },
    scoresCount: {
      sql: "uniq(scores.id)",
      alias: "scoresCount",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the trace.",
      unit: "scores",
    },
    uniqueUserIds: {
      sql: "uniq(traces.user_id)",
      alias: "uniqueUserIds",
      type: "integer",
      description: "Count of unique userIds.",
      unit: "users",
    },
    uniqueSessionIds: {
      sql: "uniq(traces.session_id)",
      alias: "uniqueSessionIds",
      type: "integer",
      description: "Count of unique sessionIds.",
      unit: "sessions",
    },
    latency: {
      sql: "date_diff('millisecond', min(observations.start_time), max(observations.end_time))",
      alias: "latency",
      type: "integer",
      relationTable: "observations",
      description:
        "Elapsed time between the first and last observation inside the trace.",
      unit: "millisecond",
    },
    totalTokens: {
      sql: "sumMap(observations.usage_details)['total']",
      alias: "totalTokens",
      type: "integer",
      relationTable: "observations",
      description: "Sum of tokens consumed by all observations in the trace.",
      unit: "tokens",
    },
    totalCost: {
      sql: "sum(observations.total_cost)",
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
  baseCte: `traces FINAL`,
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
      sql: "nullIf(events_traces.trace_name, '')",
      alias: "name",
      type: "string",
      description:
        "Name assigned to the trace (often the endpoint or operation).",
      aggregationFunction:
        "argMaxIf(events_traces.trace_name, events_traces.event_ts, events_traces.trace_name <> '')",
    },
    tags: {
      sql: "events_traces.tags",
      alias: "tags",
      type: "string[]",
      description: "User-defined tags associated with the trace.",
      aggregationFunction:
        "arrayDistinct(flatten(groupArray(events_traces.tags)))",
    },
    userId: {
      sql: "nullIf(events_traces.user_id, '')",
      alias: "userId",
      type: "string",
      description: "Identifier of the user triggering the trace.",
      aggregationFunction:
        "argMaxIf(events_traces.user_id, events_traces.event_ts, events_traces.user_id <> '')",
      highCardinality: true,
    },
    sessionId: {
      sql: "nullIf(events_traces.session_id, '')",
      alias: "sessionId",
      type: "string",
      description: "Identifier of the session triggering the trace.",
      aggregationFunction:
        "argMaxIf(events_traces.session_id, events_traces.event_ts, events_traces.session_id <> '')",
      highCardinality: true,
    },
    release: {
      sql: "nullIf(events_traces.release, '')",
      alias: "release",
      type: "string",
      description: "Release version of the trace.",
      aggregationFunction:
        "argMaxIf(events_traces.release, events_traces.event_ts, events_traces.release <> '')",
    },
    version: {
      sql: "nullIf(events_traces.version, '')",
      alias: "version",
      type: "string",
      description: "Version of the trace.",
      aggregationFunction:
        "argMaxIf(events_traces.version, events_traces.event_ts, events_traces.version <> '')",
    },
    environment: {
      sql: "nullIf(events_traces.environment, '')",
      alias: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
      aggregationFunction:
        "argMaxIf(events_traces.environment, events_traces.event_ts, events_traces.environment <> '')",
    },
    timestampMonth: {
      sql: "events_traces.start_time",
      alias: "timestampMonth",
      type: "string",
      description: "Month of the trace timestamp in YYYY-MM format.",
      aggregationFunction:
        "formatDateTime(min(events_traces.start_time), '%Y-%m')",
    },
  },
  measures: {
    count: {
      sql: "countIf(events_traces.parent_span_id = '')",
      alias: "count",
      type: "integer",
      description: "Total number of traces.",
      unit: "traces",
    },
    observationsCount: {
      sql: "uniqIf(events_traces.span_id, events_traces.parent_span_id != '')",
      alias: "observationsCount",
      type: "integer",
      description: "Unique observations linked to the trace.",
      unit: "observations",
    },
    scoresCount: {
      sql: "uniq(scores.id)",
      alias: "scoresCount",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the trace.",
      unit: "scores",
    },
    uniqueUserIds: {
      sql: "uniq(events_traces.user_id)",
      alias: "uniqueUserIds",
      type: "integer",
      description: "Count of unique userIds.",
      unit: "users",
    },
    uniqueSessionIds: {
      sql: "uniq(events_traces.session_id)",
      alias: "uniqueSessionIds",
      type: "integer",
      description: "Count of unique sessionIds.",
      unit: "sessions",
    },
    latency: {
      sql: "date_diff('millisecond', minIf(events_traces.start_time, events_traces.parent_span_id != ''), maxIf(events_traces.end_time, events_traces.parent_span_id != ''))",
      alias: "latency",
      type: "integer",
      description:
        "Elapsed time between the first and last observation inside the trace.",
      unit: "millisecond",
    },
    totalTokens: {
      sql: "sumMapIf(events_traces.usage_details, events_traces.parent_span_id != '')['total']",
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by all observations in the trace.",
      unit: "tokens",
    },
    totalCost: {
      sql: "sumIf(toNullable(events_traces.total_cost), events_traces.parent_span_id != '')",
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
  rootEventCondition: {
    column: "trace_id",
    condition: "parent_span_id = ''",
  },
  baseCte: `events_core events_traces`,
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
      sql: "formatDateTime(observations.start_time, '%Y-%m')",
      alias: "startTimeMonth",
      type: "string",
      description: "Month of the observation start_time in YYYY-MM format.",
    },
    toolNames: {
      sql: "mapKeys(observations.tool_definitions)",
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
      sql: "date_diff('millisecond', @@AGG1@@(observations.start_time), @@AGG1@@(observations.end_time))",
      aggs: { agg1: "any" },
      alias: "latency",
      type: "integer",
      description:
        "Latency of an individual observation (start time to end time).",
      unit: "millisecond",
    },
    streamingLatency: {
      // Return NULL if `completion_start_time` is NULL to avoid misleading latency values
      sql: "if(isNull(@@AGG1@@(observations.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('millisecond', @@AGG1@@(observations.completion_start_time), @@AGG1@@(observations.end_time)))",
      aggs: { agg1: "any" },
      alias: "streamingLatency",
      type: "integer",
      description:
        "Latency of the generation step (completion start time to end time).",
      unit: "millisecond",
    },
    inputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, @@AGG1@@(usage_details))))",
      aggs: { agg1: "any" },
      alias: "inputTokens",
      type: "integer",
      description: "Sum of input tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, @@AGG1@@(usage_details))))",
      aggs: { agg1: "any" },
      alias: "outputTokens",
      type: "integer",
      description: "Sum of output tokens produced by the observation.",
      unit: "tokens",
    },
    totalTokens: {
      sql: "@@AGG1@@(usage_details)['total']",
      aggs: { agg1: "sumMap" },
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokensPerSecond: {
      // Calculate average output tokens per second. Denominator uses seconds to align
      // with the `tokens/s` unit; NULL values avoided by guarding against a 0-second
      // duration.
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, @@AGG1@@(usage_details)))) / nullIf(date_diff('second', @@AGG1@@(observations.completion_start_time), @@AGG1@@(observations.end_time)), 0)",
      aggs: { agg1: "any" },
      alias: "outputTokensPerSecond",
      type: "decimal",
      description:
        "Average number of output tokens produced per second between completion start time and span end time.",
      unit: "tokens/s",
    },
    tokensPerSecond: {
      sql: "@@AGG1@@(usage_details)['total'] / nullIf(date_diff('second', @@AGG2@@(observations.start_time), @@AGG2@@(observations.end_time)), 0)",
      aggs: { agg1: "sumMap", agg2: "any" },
      alias: "tokensPerSecond",
      type: "decimal",
      description:
        "Average number of tokens consumed per second by the observation.",
      unit: "tokens/s",
    },
    inputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, @@AGG1@@(cost_details))))",
      aggs: { agg1: "any" },
      alias: "inputCost",
      type: "decimal",
      description: "Sum of input cost incurred by the observation.",
      unit: "USD",
    },
    outputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, @@AGG1@@(cost_details))))",
      aggs: { agg1: "any" },
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
      // Return NULL if `completion_start_time` is NULL to represent unknown TTFT
      sql: "if(isNull(@@AGG1@@(observations.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('millisecond', @@AGG1@@(observations.start_time), @@AGG1@@(observations.completion_start_time)))",
      aggs: { agg1: "any" },
      alias: "timeToFirstToken",
      type: "integer",
      description: "Time to first token for the observation.",
      unit: "millisecond",
    },
    countScores: {
      sql: "uniq(scores.id)",
      alias: "countScores",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the observation.",
      unit: "scores",
    },
    toolDefinitions: {
      sql: "nullIf(length(mapKeys(@@AGG1@@(tool_definitions))), 0)",
      aggs: { agg1: "any" },
      alias: "toolDefinitions",
      type: "integer",
      description: "Number of available tools per observation.",
      unit: "tools",
    },
    toolCalls: {
      sql: "nullIf(length(@@AGG1@@(tool_calls)), 0)",
      aggs: { agg1: "any" },
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
  baseCte: `observations FINAL`,
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
    sql: `formatDateTime(${tableAlias}.timestamp, '%Y-%m')`,
    alias: "timestampMonth",
    type: "string",
    description: "Month of the score timestamp in YYYY-MM format.",
  },
  timestampDay: {
    sql: `formatDateTime(${tableAlias}.timestamp, '%Y-%m-%d')`,
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

// Shared table relations factory
const createScoreTableRelations = (
  version: "v1" | "v2",
): Record<
  string,
  { name: string; joinConditionSql: string; timeDimension: string }
> => {
  if (version === "v1") {
    return {
      traces: {
        name: "traces",
        joinConditionSql:
          "ON scores.trace_id = traces.id AND scores.project_id = traces.project_id",
        timeDimension: "timestamp",
      },
      observations: {
        name: "observations",
        joinConditionSql:
          "ON scores.observation_id = observations.id AND scores.project_id = observations.project_id",
        timeDimension: "start_time",
      },
    };
  } else {
    return {
      events_traces: {
        name: "events_core",
        joinConditionSql:
          "ON scores.trace_id = events_traces.trace_id AND scores.project_id = events_traces.project_id AND events_traces.parent_span_id = ''",
        timeDimension: "start_time",
      },
      events_observations: {
        name: "events_core",
        joinConditionSql:
          "ON scores.project_id = events_observations.project_id AND scores.trace_id = events_observations.trace_id AND scores.observation_id = events_observations.span_id",
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
        sql: "count(*)",
        alias: "count",
        type: "integer",
        description: "Total number of scores.",
        unit: "scores",
      },
      value: {
        sql: "any(value)",
        alias: "value",
        type: "number",
        description: "Value of the score.",
      },
    },
    tableRelations: createScoreTableRelations(version),
    segments: [
      {
        column: "data_type",
        // We consider NUMERIC and BOOLEAN scores as numeric.
        operator: "does not contain" as const,
        value: "CATEGORICAL",
        type: "string" as const,
      },
    ], // Numeric
    timeDimension: "timestamp",
    baseCte: `scores scores_numeric FINAL`,
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
        sql: "count(*)",
        alias: "count",
        type: "integer",
        description: "Total number of scores.",
        unit: "scores",
      },
    },
    tableRelations: createScoreTableRelations(version),
    segments: [
      {
        column: "data_type",
        operator: "=" as const,
        value: "CATEGORICAL",
        type: "string" as const,
      },
    ], // Categorical
    timeDimension: "timestamp",
    baseCte: `scores scores_categorical FINAL`,
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
      sql: "formatDateTime(events_observations.start_time, '%Y-%m')",
      alias: "startTimeMonth",
      type: "string",
      description: "Month of the observation start_time in YYYY-MM format.",
    },
    toolNames: {
      sql: "mapKeys(events_observations.tool_definitions)",
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
    costType: {
      sql: "mapKeys(events_observations.cost_details)",
      alias: "costType",
      type: "string",
      description:
        "Cost category key from cost_details map (e.g. 'input', 'output', 'total').",
      pairExpand: {
        valuesSql: "mapValues(events_observations.cost_details)",
        valueAlias: "cost_value",
      },
    },
    usageType: {
      sql: "mapKeys(events_observations.usage_details)",
      alias: "usageType",
      type: "string",
      description:
        "Token usage category key from usage_details map (e.g. 'input', 'output', 'total').",
      pairExpand: {
        valuesSql: "mapValues(events_observations.usage_details)",
        valueAlias: "usage_value",
      },
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
    traceId: {
      sql: "@@AGG@@(events_observations.trace_id)",
      aggs: { agg: "any" },
      alias: "traceId",
      type: "string",
      description:
        "Trace identifier; apply uniq aggregation to count distinct traces.",
    },
    latency: {
      sql: "date_diff('millisecond', @@AGG1@@(events_observations.start_time), @@AGG1@@(events_observations.end_time))",
      aggs: { agg1: "any" },
      alias: "latency",
      type: "integer",
      description:
        "Latency of an individual observation (start time to end time).",
      unit: "millisecond",
    },
    streamingLatency: {
      sql: "if(isNull(@@AGG1@@(events_observations.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('millisecond', @@AGG1@@(events_observations.completion_start_time), @@AGG1@@(events_observations.end_time)))",
      aggs: { agg1: "any" },
      alias: "streamingLatency",
      type: "integer",
      description:
        "Latency of the generation step (completion start time to end time).",
      unit: "millisecond",
    },
    inputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, @@AGG1@@(usage_details))))",
      aggs: { agg1: "any" },
      alias: "inputTokens",
      type: "integer",
      description: "Sum of input tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, @@AGG1@@(usage_details))))",
      aggs: { agg1: "any" },
      alias: "outputTokens",
      type: "integer",
      description: "Sum of output tokens produced by the observation.",
      unit: "tokens",
    },
    totalTokens: {
      sql: "@@AGG1@@(usage_details)['total']",
      aggs: { agg1: "sumMap" },
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokensPerSecond: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, @@AGG1@@(usage_details)))) / nullIf(date_diff('second', @@AGG1@@(events_observations.completion_start_time), @@AGG1@@(events_observations.end_time)), 0)",
      aggs: { agg1: "any" },
      alias: "outputTokensPerSecond",
      type: "decimal",
      description:
        "Average number of output tokens produced per second between completion start time and span end time.",
      unit: "tokens/s",
    },
    tokensPerSecond: {
      sql: "@@AGG1@@(usage_details)['total'] / nullIf(date_diff('second', @@AGG2@@(events_observations.start_time), @@AGG2@@(events_observations.end_time)), 0)",
      aggs: { agg1: "sumMap", agg2: "any" },
      alias: "tokensPerSecond",
      type: "decimal",
      description:
        "Average number of tokens consumed per second by the observation.",
      unit: "tokens/s",
    },
    inputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, @@AGG1@@(cost_details))))",
      aggs: { agg1: "any" },
      alias: "inputCost",
      type: "decimal",
      description: "Sum of input cost incurred by the observation.",
      unit: "USD",
    },
    outputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, @@AGG1@@(cost_details))))",
      aggs: { agg1: "any" },
      alias: "outputCost",
      type: "decimal",
      description: "Sum of output cost incurred by the observation.",
      unit: "USD",
    },
    totalCost: {
      sql: "@@AGG1@@(toNullable(total_cost))",
      aggs: { agg1: "sum" },
      alias: "totalCost",
      type: "decimal",
      description: "Total cost incurred by the observation.",
      unit: "USD",
    },
    timeToFirstToken: {
      sql: "if(isNull(@@AGG1@@(events_observations.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('millisecond', @@AGG1@@(events_observations.start_time), @@AGG1@@(events_observations.completion_start_time)))",
      aggs: { agg1: "any" },
      alias: "timeToFirstToken",
      type: "integer",
      description: "Time to first token for the observation.",
      unit: "millisecond",
    },
    countScores: {
      sql: "uniq(scores.id)",
      alias: "countScores",
      type: "integer",
      relationTable: "scores",
      description: "Unique scores attached to the observation.",
      unit: "scores",
    },
    toolDefinitions: {
      sql: "nullIf(length(mapKeys(@@AGG1@@(events_observations.tool_definitions))), 0)",
      aggs: { agg1: "any" },
      alias: "toolDefinitions",
      type: "integer",
      description: "Number of available tools per observation.",
      unit: "tools",
    },
    toolCalls: {
      sql: "nullIf(length(@@AGG1@@(events_observations.tool_calls)), 0)",
      aggs: { agg1: "any" },
      alias: "toolCalls",
      type: "integer",
      description: "Number of tool calls per observation.",
      unit: "calls",
    },
    costByType: {
      sql: "cost_value",
      alias: "costByType",
      type: "decimal",
      unit: "USD",
      requiresDimension: "costType",
      description:
        "Sum of cost per category. The costType dimension is auto-included to emit the ARRAY JOIN that brings cost_value into scope.",
    },
    usageByType: {
      sql: "usage_value",
      alias: "usageByType",
      type: "integer",
      unit: "tokens",
      requiresDimension: "usageType",
      description:
        "Sum of token usage per category. The usageType dimension is auto-included to emit the ARRAY JOIN that brings usage_value into scope.",
    },
  },
  tableRelations: {
    // No traces relation - userId, sessionId, tags are denormalized on events table
    scores: {
      name: "scores",
      joinConditionSql:
        "ON events_observations.span_id = scores.observation_id AND events_observations.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  segments: [],
  timeDimension: "start_time",
  baseCte: "events_core events_observations", // No FINAL modifier needed for events_core table
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

/**
 * Check whether a widget's selected fields require v2 view declarations.
 * Returns true if any dimension or measure only exists in the v2 declaration
 * for the given view (e.g. pairExpand dimensions, requiresDimension measures).
 */
export function requiresV2(params: {
  view: string;
  dimensions: { field: string }[];
  measures: { measure: string }[];
}): boolean {
  const v1View =
    viewDeclarations.v1[params.view as keyof (typeof viewDeclarations)["v1"]];
  const v2View =
    viewDeclarations.v2[params.view as keyof (typeof viewDeclarations)["v2"]];
  if (!v1View || !v2View) return false;

  const v2OnlyDims = Object.keys(v2View.dimensions).filter(
    (k) => !(k in v1View.dimensions),
  );
  const v2OnlyMeasures = Object.keys(v2View.measures).filter(
    (k) => !(k in v1View.measures),
  );

  return (
    params.dimensions.some((d) => v2OnlyDims.includes(d.field)) ||
    params.measures.some((m) => v2OnlyMeasures.includes(m.measure))
  );
}
