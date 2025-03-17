import { type z } from "zod";
import {
  type views,
  type ViewDeclarationType,
  type DimensionsDeclarationType,
} from "@/src/features/query/server/types";

// The data model defines all available dimensions, measures, and the timeDimension for a given view.

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
    userId: {
      sql: "user_id",
      type: "string",
    },
    sessionId: {
      sql: "session_id",
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
    public: {
      sql: "public",
      type: "bool",
    },
    bookmarked: {
      sql: "bookmarked",
      type: "bool",
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
      alias: "observations_count",
      type: "count",
      relationTable: "observations",
    },
    scoresCount: {
      sql: "uniq(scores.id)",
      alias: "scores_count",
      type: "count",
      relationTable: "scores",
    },
    latency: {
      sql: "date_diff('millisecond', min(observations.start_time), max(observations.end_time))",
      alias: "latency",
      type: "number",
      relationTable: "observations",
    },
  },
  tableRelations: {
    observations: {
      name: "observations",
      joinCondition:
        "ON traces.id = observations.trace_id AND traces.project_id = observations.project_id",
      timeDimension: "start_time",
    },
    scores: {
      name: "scores",
      joinCondition:
        "ON traces.id = scores.trace_id AND traces.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  timeDimension: "timestamp",
  baseCte: `traces`,
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
      type: "string",
    },
    traceName: {
      sql: "name",
      alias: "trace_name",
      type: "string",
      relationTable: "traces",
    },
    environment: {
      sql: "environment",
      type: "string",
    },
    parentObservationId: {
      sql: "parent_observation_id",
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
    providedModelName: {
      sql: "provided_model_name",
      type: "string",
    },
    promptName: {
      sql: "prompt_name",
      type: "string",
    },
    promptVersion: {
      sql: "prompt_version",
      type: "string",
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
      sql: "sum(usage_details)['total']",
      alias: "total_tokens",
      type: "sum",
    },
    totalCost: {
      sql: "sum(total_cost)",
      alias: "total_cost",
      type: "sum",
    },
    timeToFirstToken: {
      sql: "date_diff('millisecond', any(observations.start_time), any(observations.completion_start_time))",
      alias: "time_to_first_token",
      type: "number",
    },
    countScores: {
      sql: "uniq(scores.id)",
      alias: "count_scores",
      type: "count",
      relationTable: "scores",
    },
  },
  tableRelations: {
    traces: {
      name: "traces",
      joinCondition:
        "ON observations.trace_id = traces.id AND observations.project_id = traces.project_id",
      timeDimension: "timestamp",
    },
    scores: {
      name: "scores",
      joinCondition:
        "ON observations.id = scores.observation_id AND observations.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  timeDimension: "start_time",
  baseCte: `observations`,
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
  traceId: {
    sql: "trace_id",
    type: "string",
  },
  traceName: {
    sql: "traces.name",
    alias: "trace_name",
    type: "string",
    relationTable: "traces",
  },
  userId: {
    sql: "traces.user_id",
    alias: "user_id",
    type: "string",
    relationTable: "traces",
  },
  sessionId: {
    sql: "traces.session_id",
    alias: "session_id",
    type: "string",
    relationTable: "traces",
  },
  observationId: {
    sql: "observation_id",
    type: "string",
  },
  observationName: {
    sql: "observations.name",
    alias: "observation_name",
    type: "string",
    relationTable: "observations",
  },
  observationModelName: {
    sql: "observations.provided_model_name",
    alias: "observation_model_name",
    type: "string",
    relationTable: "observations",
  },
  observationPromptName: {
    sql: "observations.prompt_name",
    alias: "observation_prompt_name",
    type: "string",
    relationTable: "observations",
  },
  observationPromptVersion: {
    sql: "observations.prompt_version",
    alias: "observation_prompt_version",
    type: "string",
    relationTable: "observations",
  },
  configId: {
    sql: "config_id",
    type: "string",
  },
};

// TODO: How do we add the custom filter expression that comes with each of these
export const scoresNumericView: ViewDeclarationType = {
  name: "scores-numeric",
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
      sql: "value",
      alias: "value",
      type: "number",
    },
  },
  tableRelations: {
    traces: {
      name: "traces",
      joinCondition:
        "ON scores.trace_id = traces.id AND scores.project_id = traces.project_id",
      timeDimension: "timestamp",
    },
    observations: {
      name: "observations",
      joinCondition:
        "ON scores.observation_id = observations.id AND scores.project_id = observations.project_id",
      timeDimension: "start_time",
    },
  },
  timeDimension: "timestamp",
  baseCte: `scores`,
};

export const scoresCategoricalView: ViewDeclarationType = {
  name: "scores-categorical",
  dimensions: {
    ...scoreBaseDimensions,
    stringValue: {
      sql: "string_value",
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
      joinCondition:
        "ON scores.trace_id = traces.id AND scores.project_id = traces.project_id",
      timeDimension: "timestamp",
    },
    observations: {
      name: "observations",
      joinCondition:
        "ON scores.observation_id = observations.id AND scores.project_id = observations.project_id",
      timeDimension: "start_time",
    },
  },
  timeDimension: "timestamp",
  baseCte: `scores`,
};

// TODO: Check how we can do the correct CTE here.
export const usersView: ViewDeclarationType = {
  name: "users",
  dimensions: {},
  measures: {},
  tableRelations: {},
  timeDimension: "timestamp",
  baseCte: `users`,
};

export const sessionsView: ViewDeclarationType = {
  name: "sessions",
  dimensions: {},
  measures: {},
  tableRelations: {},
  timeDimension: "timestamp",
  baseCte: `sessions`,
};

export const viewDeclarations: Record<
  z.infer<typeof views>,
  ViewDeclarationType
> = {
  traces: traceView,
  observations: observationsView,
  "scores-numeric": scoresNumericView,
  "scores-categorical": scoresCategoricalView,
  sessions: sessionsView,
  users: usersView,
};
