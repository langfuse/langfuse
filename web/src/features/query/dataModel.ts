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
  dimensions: {
    id: {
      sql: "id",
      type: "string",
    },
    name: {
      sql: "name",
      type: "string",
    },
    tags: {
      sql: "tags",
      type: "string[]",
    },
    userId: {
      sql: "user_id",
      alias: "userId",
      type: "string",
    },
    sessionId: {
      sql: "session_id",
      alias: "sessionId",
      type: "string",
    },
    release: {
      sql: "release",
      type: "string",
    },
    version: {
      sql: "version",
      type: "string",
    },
    environment: {
      sql: "environment",
      type: "string",
    },
    observationName: {
      sql: "name",
      alias: "observationName",
      type: "string",
      relationTable: "observations",
    },
    scoreName: {
      sql: "name",
      alias: "scoreName",
      type: "string",
      relationTable: "scores",
    },
  },
  measures: {
    count: {
      sql: "count(*)",
      alias: "count",
      type: "count",
    },
    observationsCount: {
      sql: "uniq(observations.id)",
      alias: "observationsCount",
      type: "count",
      relationTable: "observations",
    },
    scoresCount: {
      sql: "uniq(scores.id)",
      alias: "scoresCount",
      type: "count",
      relationTable: "scores",
    },
    latency: {
      sql: "date_diff('millisecond', min(observations.start_time), max(observations.end_time))",
      alias: "latency",
      type: "number",
      relationTable: "observations",
    },
    totalTokens: {
      sql: "sumMap(observations.usage_details)['total']",
      alias: "totalTokens",
      type: "sum",
      relationTable: "observations",
    },
    totalCost: {
      sql: "sum(observations.total_cost)",
      alias: "totalCost",
      type: "sum",
      relationTable: "observations",
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
  dimensions: {
    id: {
      sql: "id",
      type: "string",
    },
    traceId: {
      sql: "trace_id",
      alias: "traceId",
      type: "string",
    },
    traceName: {
      sql: "name",
      alias: "traceName",
      type: "string",
      relationTable: "traces",
    },
    environment: {
      sql: "environment",
      type: "string",
    },
    parentObservationId: {
      sql: "parent_observation_id",
      alias: "parentObservationId",
      type: "string",
    },
    type: {
      sql: "type",
      type: "string",
    },
    name: {
      sql: "name",
      type: "string",
    },
    level: {
      sql: "level",
      type: "string",
    },
    version: {
      sql: "version",
      type: "string",
    },
    tags: {
      sql: "tags",
      type: "string[]",
      relationTable: "traces",
    },
    providedModelName: {
      sql: "provided_model_name",
      alias: "providedModelName",
      type: "string",
    },
    promptName: {
      sql: "prompt_name",
      alias: "promptName",
      type: "string",
    },
    promptVersion: {
      sql: "prompt_version",
      alias: "promptVersion",
      type: "string",
    },
    userId: {
      sql: "user_id",
      alias: "userId",
      type: "string",
      relationTable: "traces",
    },
    sessionId: {
      sql: "session_id",
      alias: "sessionId",
      type: "string",
      relationTable: "traces",
    },
    traceRelease: {
      sql: "release",
      type: "string",
      relationTable: "traces",
    },
    traceVersion: {
      sql: "version",
      type: "string",
      relationTable: "traces",
    },
    scoreName: {
      sql: "name",
      alias: "scoreName",
      type: "string",
      relationTable: "scores",
    },
  },
  measures: {
    count: {
      sql: "count(*)",
      alias: "count",
      type: "count",
    },
    latency: {
      sql: "date_diff('millisecond', any(observations.start_time), any(observations.end_time))",
      alias: "latency",
      type: "number",
    },
    totalTokens: {
      sql: "sumMap(usage_details)['total']",
      alias: "totalTokens",
      type: "sum",
    },
    totalCost: {
      sql: "sum(total_cost)",
      alias: "totalCost",
      type: "sum",
    },
    timeToFirstToken: {
      sql: "date_diff('millisecond', any(observations.start_time), any(observations.completion_start_time))",
      alias: "timeToFirstToken",
      type: "number",
    },
    countScores: {
      sql: "uniq(scores.id)",
      alias: "countScores",
      type: "count",
      relationTable: "scores",
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
  },
  environment: {
    sql: "environment",
    type: "string",
  },
  name: {
    sql: "name",
    type: "string",
  },
  source: {
    sql: "source",
    type: "string",
  },
  dataType: {
    sql: "data_type",
    alias: "dataType",
    type: "string",
  },
  traceId: {
    sql: "trace_id",
    alias: "traceId",
    type: "string",
  },
  traceName: {
    sql: "name",
    alias: "traceName",
    type: "string",
    relationTable: "traces",
  },
  tags: {
    sql: "tags",
    type: "string[]",
    relationTable: "traces",
  },
  userId: {
    sql: "user_id",
    alias: "userId",
    type: "string",
    relationTable: "traces",
  },
  sessionId: {
    sql: "session_id",
    alias: "sessionId",
    type: "string",
    relationTable: "traces",
  },
  traceRelease: {
    sql: "release",
    type: "string",
    relationTable: "traces",
  },
  traceVersion: {
    sql: "version",
    type: "string",
    relationTable: "traces",
  },
  observationId: {
    sql: "observation_id",
    alias: "observationId",
    type: "string",
  },
  observationName: {
    sql: "name",
    alias: "observationName",
    type: "string",
    relationTable: "observations",
  },
  observationModelName: {
    sql: "provided_model_name",
    alias: "observationModelName",
    type: "string",
    relationTable: "observations",
  },
  observationPromptName: {
    sql: "prompt_name",
    alias: "observationPromptName",
    type: "string",
    relationTable: "observations",
  },
  observationPromptVersion: {
    sql: "prompt_version",
    alias: "observationPromptVersion",
    type: "string",
    relationTable: "observations",
  },
  configId: {
    sql: "config_id",
    alias: "configId",
    type: "string",
  },
};

export const scoresNumericView: ViewDeclarationType = {
  name: "scores_numeric",
  dimensions: {
    ...scoreBaseDimensions,
  },
  measures: {
    count: {
      sql: "count(*)",
      alias: "count",
      type: "count",
    },
    value: {
      sql: "any(value)",
      alias: "value",
      type: "number",
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
  dimensions: {
    ...scoreBaseDimensions,
    stringValue: {
      sql: "string_value",
      alias: "stringValue",
      type: "string",
    },
  },
  measures: {
    count: {
      sql: "count(*)",
      alias: "count",
      type: "count",
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
