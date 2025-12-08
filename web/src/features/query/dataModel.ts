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
  },
  measures: {
    count: {
      sql: "count(*)",
      alias: "count",
      type: "integer",
      description: "Total number of observations.",
      unit: "observations",
    },
    latency: {
      sql: "date_diff('millisecond', any(observations.start_time), any(observations.end_time))",
      alias: "latency",
      type: "integer",
      description:
        "Latency of an individual observation (start time to end time).",
      unit: "millisecond",
    },
    streamingLatency: {
      // Return NULL if `completion_start_time` is NULL to avoid misleading latency values
      sql: "if(isNull(any(observations.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('millisecond', any(observations.completion_start_time), any(observations.end_time)))",
      alias: "streamingLatency",
      type: "integer",
      description:
        "Latency of the generation step (completion start time to end time).",
      unit: "millisecond",
    },
    inputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, any(usage_details))))",
      alias: "inputTokens",
      type: "integer",
      description: "Sum of input tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, any(usage_details))))",
      alias: "outputTokens",
      type: "integer",
      description: "Sum of output tokens produced by the observation.",
      unit: "tokens",
    },
    totalTokens: {
      sql: "sumMap(usage_details)['total']",
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokensPerSecond: {
      // Calculate average output tokens per second. Denominator uses seconds to align
      // with the `tokens/s` unit; NULL values avoided by guarding against a 0-second
      // duration.
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, any(usage_details)))) / nullIf(date_diff('second', any(observations.completion_start_time), any(observations.end_time)), 0)",
      alias: "outputTokensPerSecond",
      type: "decimal",
      description:
        "Average number of output tokens produced per second between completion start time and span end time.",
      unit: "tokens/s",
    },
    tokensPerSecond: {
      sql: "sumMap(usage_details)['total'] / date_diff('second', any(observations.start_time), any(observations.end_time))",
      alias: "tokensPerSecond",
      type: "decimal",
      description:
        "Average number of tokens consumed per second by the observation.",
      unit: "tokens/s",
    },
    inputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, any(cost_details))))",
      alias: "inputCost",
      type: "decimal",
      description: "Sum of input cost incurred by the observation.",
      unit: "USD",
    },
    outputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, any(cost_details))))",
      alias: "outputCost",
      type: "decimal",
      description: "Sum of output cost incurred by the observation.",
      unit: "USD",
    },
    totalCost: {
      sql: "sum(total_cost)",
      alias: "totalCost",
      type: "decimal",
      description: "Total cost incurred by the observation.",
      unit: "USD",
    },
    timeToFirstToken: {
      // Return NULL if `completion_start_time` is NULL to represent unknown TTFT
      sql: "if(isNull(any(observations.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('millisecond', any(observations.start_time), any(observations.completion_start_time)))",
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
  },
  // Trace metadata on events table (accessed via events JOIN)
  userId: {
    sql: "events.user_id",
    alias: "userId",
    type: "string",
    relationTable: "events",
    description: "Identifier of the user.",
  },
  tags: {
    sql: "events.tags",
    alias: "tags",
    type: "string[]",
    relationTable: "events",
    description: "User-defined tags.",
  },
  release: {
    sql: "events.release",
    alias: "release",
    type: "string",
    relationTable: "events",
    description: "Release version.",
  },
  // Observation fields from events table
  observationName: {
    sql: "events.name",
    alias: "observationName",
    type: "string",
    relationTable: "events",
    description: "Name of the observation associated with the score.",
  },
  observationModelName: {
    sql: "events.provided_model_name",
    alias: "observationModelName",
    type: "string",
    relationTable: "events",
    description: "Name of the model used for the observation.",
  },
  observationPromptName: {
    sql: "events.prompt_name",
    alias: "observationPromptName",
    type: "string",
    relationTable: "events",
    description: "Name of the prompt used for the observation.",
  },
  observationPromptVersion: {
    sql: "events.prompt_version",
    alias: "observationPromptVersion",
    type: "string",
    relationTable: "events",
    description: "Version of the prompt used for the observation.",
  },
};

// Factory for shared score-specific dimensions (both numeric and categorical)
const createScoreSpecificDimensions = (
  tableAlias: string,
): DimensionsDeclarationType => ({
  id: {
    sql: `${tableAlias}.id`,
    alias: "id",
    type: "string",
    description: "Unique identifier of the score entry.",
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
      events: {
        name: "events",
        joinConditionSql:
          "ON (scores.trace_id = events.span_id OR scores.observation_id = events.span_id) AND scores.project_id = events.project_id",
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
      ...createScoreSpecificDimensions("scores_numeric"),
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
      ...createScoreSpecificDimensions("scores_categorical"),
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
    },
    traceId: {
      sql: "events_observations.trace_id",
      alias: "traceId",
      type: "string",
      description: "Identifier linking the observation to its parent trace.",
    },
    environment: {
      sql: "events_observations.environment",
      alias: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
    },
    parentObservationId: {
      sql: "events_observations.parent_span_id",
      alias: "parentObservationId",
      type: "string",
      description:
        "Identifier of the parent observation. Empty for the root span.",
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
      sql: "events_observations.version",
      alias: "version",
      type: "string",
      description: "Version of the observation.",
    },
    // Denormalized trace fields from events table
    userId: {
      sql: "events_observations.user_id",
      alias: "userId",
      type: "string",
      description: "Identifier of the user triggering the observation.",
    },
    sessionId: {
      sql: "events_observations.session_id",
      alias: "sessionId",
      type: "string",
      description: "Identifier of the session triggering the observation.",
    },
    tags: {
      sql: "events_observations.tags",
      alias: "tags",
      type: "string[]",
      description: "User-defined tags associated with the trace.",
    },
    release: {
      sql: "events_observations.release",
      alias: "release",
      type: "string",
      description: "Release version.",
    },
    providedModelName: {
      sql: "events_observations.provided_model_name",
      alias: "providedModelName",
      type: "string",
      description: "Name of the model used for the observation.",
    },
    promptName: {
      sql: "events_observations.prompt_name",
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
      sql: "formatDateTime(events.start_time, '%Y-%m')",
      alias: "startTimeMonth",
      type: "string",
      description: "Month of the observation start_time in YYYY-MM format.",
    },
  },
  measures: {
    count: {
      sql: "count(*)",
      alias: "count",
      type: "integer",
      description: "Total number of observations.",
      unit: "observations",
    },
    // Convert microseconds to milliseconds for consistency
    latency: {
      sql: "date_diff('microsecond', any(events.start_time), any(events.end_time)) / 1000",
      alias: "latency",
      type: "integer",
      description:
        "Latency of an individual observation (start time to end time).",
      unit: "millisecond",
    },
    streamingLatency: {
      sql: "if(isNull(any(events.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('microsecond', any(events.completion_start_time), any(events.end_time)) / 1000)",
      alias: "streamingLatency",
      type: "integer",
      description:
        "Latency of the generation step (completion start time to end time).",
      unit: "millisecond",
    },
    inputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, any(usage_details))))",
      alias: "inputTokens",
      type: "integer",
      description: "Sum of input tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokens: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, any(usage_details))))",
      alias: "outputTokens",
      type: "integer",
      description: "Sum of output tokens produced by the observation.",
      unit: "tokens",
    },
    totalTokens: {
      sql: "sumMap(usage_details)['total']",
      alias: "totalTokens",
      type: "integer",
      description: "Sum of tokens consumed by the observation.",
      unit: "tokens",
    },
    outputTokensPerSecond: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, any(usage_details)))) / nullIf(date_diff('second', any(events.completion_start_time), any(events.end_time)), 0)",
      alias: "outputTokensPerSecond",
      type: "decimal",
      description:
        "Average number of output tokens produced per second between completion start time and span end time.",
      unit: "tokens/s",
    },
    tokensPerSecond: {
      sql: "sumMap(usage_details)['total'] / date_diff('second', any(events.start_time), any(events.end_time))",
      alias: "tokensPerSecond",
      type: "decimal",
      description:
        "Average number of tokens consumed per second by the observation.",
      unit: "tokens/s",
    },
    inputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, any(cost_details))))",
      alias: "inputCost",
      type: "decimal",
      description: "Sum of input cost incurred by the observation.",
      unit: "USD",
    },
    outputCost: {
      sql: "arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, any(cost_details))))",
      alias: "outputCost",
      type: "decimal",
      description: "Sum of output cost incurred by the observation.",
      unit: "USD",
    },
    totalCost: {
      sql: "sum(total_cost)",
      alias: "totalCost",
      type: "decimal",
      description: "Total cost incurred by the observation.",
      unit: "USD",
    },
    timeToFirstToken: {
      sql: "if(isNull(any(events.completion_start_time)), CAST(NULL AS Nullable(Int64)), date_diff('microsecond', any(events.start_time), any(events.completion_start_time)) / 1000)",
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
  baseCte: "events events_observations", // No FINAL modifier needed for events table
};

// Define versioned structure type
// v1 has all views including traces (normalized model with traces table)
// v2 omits traces (denormalized model with events table only)
type VersionedViewDeclarations = {
  readonly v1: {
    readonly traces: ViewDeclarationType;
    readonly observations: ViewDeclarationType;
    readonly "scores-numeric": ViewDeclarationType;
    readonly "scores-categorical": ViewDeclarationType;
  };
  readonly v2: {
    readonly observations: ViewDeclarationType;
    readonly "scores-numeric": ViewDeclarationType;
    readonly "scores-categorical": ViewDeclarationType;
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
    // No traces in v2 - trace metadata is denormalized in events table
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
