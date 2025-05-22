import { type z } from "zod";
import {
  type views,
  type ViewDeclarationType,
  type DimensionsDeclarationType,
} from "@/src/features/query/types";

// The data model defines all available dimensions, measures, and the timeDimension for a given view.
// Make sure to update ./dashboardUiTableToViewMapping.ts if you make changes

export const traceView: ViewDeclarationType = {
  name: "traces",
  description:
    "Traces represent a group of observations and typically represent a single request or operation.",
  dimensions: {
    id: {
      sql: "id",
      type: "string",
      description: "Unique identifier of the trace.",
    },
    name: {
      sql: "name",
      type: "string",
      description:
        "Name assigned to the trace (often the endpoint or operation).",
    },
    tags: {
      sql: "tags",
      type: "string[]",
      description: "User-defined tags associated with the trace.",
    },
    userId: {
      sql: "user_id",
      alias: "userId",
      type: "string",
      description: "Identifier of the user triggering the trace.",
    },
    sessionId: {
      sql: "session_id",
      alias: "sessionId",
      type: "string",
      description: "Identifier of the session triggering the trace.",
    },
    release: {
      sql: "release",
      type: "string",
      description: "Release version of the trace.",
    },
    version: {
      sql: "version",
      type: "string",
      description: "Version of the trace.",
    },
    environment: {
      sql: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
    },
    observationName: {
      sql: "name",
      alias: "observationName",
      type: "string",
      relationTable: "observations",
      description: "Name of the observation.",
    },
    scoreName: {
      sql: "name",
      alias: "scoreName",
      type: "string",
      relationTable: "scores",
      description: "Name of the score.",
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
      sql: "id",
      type: "string",
      description: "Unique identifier for the observation.",
    },
    traceId: {
      sql: "trace_id",
      alias: "traceId",
      type: "string",
      description: "Identifier linking the observation to its parent trace.",
    },
    traceName: {
      sql: "name",
      alias: "traceName",
      type: "string",
      relationTable: "traces",
      description: "Name of the parent trace.",
    },
    environment: {
      sql: "environment",
      type: "string",
      description: "Deployment environment (e.g., production, staging).",
    },
    parentObservationId: {
      sql: "parent_observation_id",
      alias: "parentObservationId",
      type: "string",
      description:
        "Identifier of the parent observation. Empty for the root span.",
    },
    type: {
      sql: "type",
      type: "string",
      description:
        "Type of the observation. Can be a SPAN, GENERATION, or EVENT.",
    },
    name: {
      sql: "name",
      type: "string",
      description: "Name of the observation.",
    },
    level: {
      sql: "level",
      type: "string",
      description: "Logging level of the observation.",
    },
    version: {
      sql: "version",
      type: "string",
      description: "Version of the observation.",
    },
    tags: {
      sql: "tags",
      type: "string[]",
      relationTable: "traces",
      description: "User-defined tags associated with the trace.",
    },
    providedModelName: {
      sql: "provided_model_name",
      alias: "providedModelName",
      type: "string",
      description: "Name of the model used for the observation.",
    },
    promptName: {
      sql: "prompt_name",
      alias: "promptName",
      type: "string",
      description: "Name of the prompt used for the observation.",
    },
    promptVersion: {
      sql: "prompt_version",
      alias: "promptVersion",
      type: "string",
      description: "Version of the prompt used for the observation.",
    },
    userId: {
      sql: "user_id",
      alias: "userId",
      type: "string",
      relationTable: "traces",
      description: "Identifier of the user triggering the observation.",
    },
    sessionId: {
      sql: "session_id",
      alias: "sessionId",
      type: "string",
      relationTable: "traces",
      description: "Identifier of the session triggering the observation.",
    },
    traceRelease: {
      sql: "release",
      alias: "traceRelease",
      type: "string",
      relationTable: "traces",
      description: "Release version of the parent trace.",
    },
    traceVersion: {
      sql: "version",
      alias: "traceVersion",
      type: "string",
      relationTable: "traces",
      description: "Version of the parent trace.",
    },
    scoreName: {
      sql: "name",
      alias: "scoreName",
      type: "string",
      relationTable: "scores",
      description: "Name of the score.",
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
  id: {
    sql: "id",
    type: "string",
    description: "Unique identifier of the score entry.",
  },
  environment: {
    sql: "environment",
    type: "string",
    description: "Deployment environment (e.g., production, staging).",
  },
  name: {
    sql: "name",
    type: "string",
    description: "Name of the score (e.g., accuracy, toxicity).",
  },
  source: {
    sql: "source",
    type: "string",
    description: "Origin of the score. Can be API, ANNOTATION, or EVAL.",
  },
  dataType: {
    sql: "data_type",
    alias: "dataType",
    type: "string",
    description:
      "Internal data type of the score (NUMERIC, BOOLEAN, CATEGORICAL).",
  },
  traceId: {
    sql: "trace_id",
    alias: "traceId",
    type: "string",
    description: "Identifier of the parent trace.",
  },
  traceName: {
    sql: "name",
    alias: "traceName",
    type: "string",
    relationTable: "traces",
    description: "Name of the parent trace.",
  },
  tags: {
    sql: "tags",
    type: "string[]",
    relationTable: "traces",
    description: "User-defined tags associated with the trace.",
  },
  userId: {
    sql: "user_id",
    alias: "userId",
    type: "string",
    relationTable: "traces",
    description: "Identifier of the user triggering the trace.",
  },
  sessionId: {
    sql: "session_id",
    alias: "sessionId",
    type: "string",
    relationTable: "traces",
    description: "Identifier of the session triggering the trace.",
  },
  traceRelease: {
    sql: "release",
    alias: "traceRelease",
    type: "string",
    relationTable: "traces",
    description: "Release version of the parent trace.",
  },
  traceVersion: {
    sql: "version",
    alias: "traceVersion",
    type: "string",
    relationTable: "traces",
    description: "Version of the parent trace.",
  },
  observationId: {
    sql: "observation_id",
    alias: "observationId",
    type: "string",
    description: "Identifier of the observation associated with the score.",
  },
  observationName: {
    sql: "name",
    alias: "observationName",
    type: "string",
    relationTable: "observations",
    description: "Name of the observation associated with the score.",
  },
  observationModelName: {
    sql: "provided_model_name",
    alias: "observationModelName",
    type: "string",
    relationTable: "observations",
    description: "Name of the model used for the observation.",
  },
  observationPromptName: {
    sql: "prompt_name",
    alias: "observationPromptName",
    type: "string",
    relationTable: "observations",
    description: "Name of the prompt used for the observation.",
  },
  observationPromptVersion: {
    sql: "prompt_version",
    alias: "observationPromptVersion",
    type: "string",
    relationTable: "observations",
    description: "Version of the prompt used for the observation.",
  },
  configId: {
    sql: "config_id",
    alias: "configId",
    type: "string",
    description: "Identifier of the config associated with the score.",
  },
};

export const scoresNumericView: ViewDeclarationType = {
  name: "scores_numeric",
  description:
    "Scores are flexible objects that are used for evaluations. This view contains numeric scores.",
  dimensions: {
    ...scoreBaseDimensions,
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
  tableRelations: {
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
  },
  segments: [
    {
      column: "data_type",
      // We consider NUMERIC and BOOLEAN scores as numeric.
      operator: "does not contain",
      value: "CATEGORICAL",
      type: "string",
    },
  ],
  timeDimension: "timestamp",
  baseCte: `scores scores_numeric FINAL`,
};

export const scoresCategoricalView: ViewDeclarationType = {
  name: "scores_categorical",
  description:
    "Scores are flexible objects that are used for evaluations. This view contains categorical scores.",
  dimensions: {
    ...scoreBaseDimensions,
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
  tableRelations: {
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
  },
  segments: [
    {
      column: "data_type",
      operator: "=",
      value: "CATEGORICAL",
      type: "string",
    },
  ],
  timeDimension: "timestamp",
  baseCte: `scores scores_categorical FINAL`,
};

export const viewDeclarations: Record<
  z.infer<typeof views>,
  ViewDeclarationType
> = {
  traces: traceView,
  observations: observationsView,
  "scores-numeric": scoresNumericView,
  "scores-categorical": scoresCategoricalView,
};
